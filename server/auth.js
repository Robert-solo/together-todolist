import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { writeFileSync, unlinkSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  createUser, countUsers, findUserByUsername, findUserById, getPasswordHash,
  listUsersWithStats, updateUser, deleteUser, adminCount,
  createSession, findSession, touchSession, deleteSession,
  deleteSessionsForUser, deleteOtherSessions,
  getSetting, setSetting,
  seedDefaultCategories, claimOrphanData, orphanDataExists, UPLOAD_DIR,
} from './db.js'
import { nanoid } from '../src/utils/nanoid.js'

const MAX_BODY = 2 * 1024 * 1024
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
const SESSION_TOUCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function nowISO() {
  return new Date().toISOString()
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('payload too large'), { status: 413 }))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!chunks.length) return resolve({})
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(Object.assign(new Error('invalid JSON'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

const send = (res, status, data) => {
  const body = JSON.stringify(data ?? {})
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

const bad = (res, msg, status = 400) => send(res, status, { error: msg })

const str = (v, field) => {
  if (typeof v !== 'string' || !v.length)
    throw Object.assign(new Error(`${field} required`), { status: 400 })
  return v
}

/* ------------------------------------------------------------------ */
/* password hashing with scrypt                                        */
/* ------------------------------------------------------------------ */

function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

function verifyPassword(password, stored) {
  const [algo, saltHex, hashHex] = stored.split('$')
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, 'hex')
  const hash = Buffer.from(hashHex, 'hex')
  const candidate = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })
  return timingSafeEqual(hash, candidate)
}

function validatePassword(password) {
  if (!password || password.length < 8) return '密码至少需要 8 位'
  if (password.length > 128) return '密码最多 128 位'
  return null
}

/* ------------------------------------------------------------------ */
/* session tokens                                                      */
/* ------------------------------------------------------------------ */

function generateToken() {
  return randomBytes(32).toString('hex')
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function setCookie(res, token, secure) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000)
  const parts = [
    `zhiri_sid=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]
  if (secure) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', 'zhiri_sid=; Path=/; HttpOnly; Max-Age=0')
}

function getCookie(req) {
  const header = req.headers.cookie
  if (!header) return null
  const match = header.match(/zhiri_sid=([^;]+)/)
  return match ? match[1] : null
}

/* ------------------------------------------------------------------ */
/* login rate limiting (in-memory, resets on restart)                 */
/* ------------------------------------------------------------------ */

const loginAttempts = new Map() // key: username+ip, value: {count, resetAt}
const RATE_WINDOW_MS = 15 * 60 * 1000
const RATE_LIMIT = 5

function checkRateLimit(username, ip) {
  const key = `${username}:${ip}`
  const now = Date.now()
  const entry = loginAttempts.get(key)
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return { ok: true }
  }
  if (entry.count >= RATE_LIMIT) {
    const waitSec = Math.ceil((entry.resetAt - now) / 1000)
    return { ok: false, waitSec }
  }
  entry.count++
  return { ok: true }
}

function clearRateLimit(username, ip) {
  loginAttempts.delete(`${username}:${ip}`)
}

/* ------------------------------------------------------------------ */
/* auth middleware                                                     */
/* ------------------------------------------------------------------ */

async function authenticate(req) {
  const token = getCookie(req)
  if (!token) return null
  const tokenHash = hashToken(token)
  const session = findSession(tokenHash)
  if (!session) return null

  const user = findUserById(session.userId)
  if (!user || user.status !== 'active') {
    deleteSession(tokenHash)
    return null
  }

  const lastSeen = new Date(session.lastSeenAt).getTime()
  const now = Date.now()
  if (now - lastSeen < SESSION_TOUCH_WINDOW_MS) {
    touchSession(tokenHash)
  }

  return { user, tokenHash }
}

function requireAuth(res, auth, role = null) {
  if (!auth) {
    bad(res, 'unauthorized', 401)
    return false
  }
  if (role === 'admin' && auth.user.role !== 'admin') {
    bad(res, 'forbidden', 403)
    return false
  }
  return true
}

/* ------------------------------------------------------------------ */
/* auth endpoints                                                      */
/* ------------------------------------------------------------------ */

async function handleSetupStatus(res) {
  const needsSetup = countUsers() === 0
  send(res, 200, {
    needsSetup,
    hasOrphanData: needsSetup && orphanDataExists(),
    registrationOpen: getSetting('registrationOpen', '1') === '1',
  })
}

async function handleSetup(req, res) {
  if (countUsers() > 0) {
    return bad(res, 'setup already completed', 409)
  }

  const { username, password, displayName } = await readBody(req)
  const usernameErr = validateUsername(username)
  if (usernameErr) return bad(res, usernameErr)

  const pwdErr = validatePassword(password)
  if (pwdErr) return bad(res, pwdErr)

  const userId = nanoid()
  const user = createUser({
    id: userId,
    username: str(username, 'username'),
    displayName: str(displayName, 'displayName'),
    passwordHash: hashPassword(password),
    role: 'admin',
    createdAt: nowISO(),
  })

  if (orphanDataExists()) {
    claimOrphanData(userId)
  }
  seedDefaultCategories(userId)

  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  createSession({
    tokenHash,
    userId: user.id,
    expiresAt,
    userAgent: req.headers['user-agent'] || '',
  })

  const secure = req.headers['x-forwarded-proto'] === 'https'
  setCookie(res, token, secure)
  send(res, 201, { user })
}

async function handleRegister(req, res) {
  const registrationOpen = getSetting('registrationOpen', '1') === '1'
  if (!registrationOpen) {
    return bad(res, '注册已关闭', 403)
  }

  const { username, password, displayName } = await readBody(req)
  const usernameErr = validateUsername(username)
  if (usernameErr) return bad(res, usernameErr)

  if (findUserByUsername(username)) {
    return bad(res, '用户名已被占用', 409)
  }

  const pwdErr = validatePassword(password)
  if (pwdErr) return bad(res, pwdErr)

  const userId = nanoid()
  const user = createUser({
    id: userId,
    username: str(username, 'username'),
    displayName: str(displayName, 'displayName'),
    passwordHash: hashPassword(password),
    role: 'user',
    createdAt: nowISO(),
  })

  seedDefaultCategories(userId)

  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  createSession({
    tokenHash,
    userId: user.id,
    expiresAt,
    userAgent: req.headers['user-agent'] || '',
  })

  const secure = req.headers['x-forwarded-proto'] === 'https'
  setCookie(res, token, secure)
  send(res, 201, { user })
}

async function handleLogin(req, res) {
  const { username, password } = await readBody(req)
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || ''

  const limit = checkRateLimit(username, ip)
  if (!limit.ok) {
    return bad(res, `登录失败次数过多，请 ${limit.waitSec} 秒后重试`, 429)
  }

  const user = findUserByUsername(username)
  const passwordHash = user ? getPasswordHash(user.id) : null
  const valid = passwordHash && verifyPassword(password, passwordHash)

  if (!valid || !user || user.status !== 'active') {
    return bad(res, '用户名或密码不正确', 401)
  }

  clearRateLimit(username, ip)

  updateUser(user.id, { lastLoginAt: nowISO() })

  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  createSession({
    tokenHash,
    userId: user.id,
    expiresAt,
    userAgent: req.headers['user-agent'] || '',
  })

  const secure = req.headers['x-forwarded-proto'] === 'https'
  setCookie(res, token, secure)
  send(res, 200, { user: findUserById(user.id) })
}

async function handleLogout(req, res, auth) {
  if (auth) {
    deleteSession(auth.tokenHash)
  }
  clearCookie(res)
  send(res, 200, { ok: true })
}

async function handleMe(req, res, auth) {
  if (!requireAuth(res, auth)) return
  send(res, 200, { user: auth.user })
}

async function handleUpdateMe(req, res, auth) {
  if (!requireAuth(res, auth)) return
  const { displayName, email, bio, avatar } = await readBody(req)
  const patch = {}
  if (displayName !== undefined) patch.displayName = str(displayName, 'displayName').trim().slice(0, 30)
  if (email !== undefined) {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, '邮箱格式不正确')
    patch.email = email || null
  }
  if (bio !== undefined) patch.bio = String(bio).slice(0, 200)
  if (avatar === '') { removeAvatarFile(auth.user.avatar); patch.avatar = '' }
  updateUser(auth.user.id, patch)
  send(res, 200, { user: findUserById(auth.user.id) })
}

async function handleChangePassword(req, res, auth) {
  if (!requireAuth(res, auth)) return
  const { currentPassword, newPassword } = await readBody(req)

  const stored = getPasswordHash(auth.user.id)
  if (!verifyPassword(currentPassword, stored)) {
    return bad(res, '当前密码不正确', 400)
  }

  const pwdErr = validatePassword(newPassword)
  if (pwdErr) return bad(res, pwdErr)

  updateUser(auth.user.id, { passwordHash: hashPassword(newPassword) })
  deleteOtherSessions(auth.user.id, auth.tokenHash)
  send(res, 200, { ok: true })
}

const AVATAR_MAX = 600 * 1024
const AVATAR_URL_RE = /^\/uploads\/[a-zA-Z0-9_-]+\.(png|jpg|webp)$/

function sniffImage(buf) {
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp'
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf.length > 8 && buf.subarray(1, 4).toString('latin1') === 'PNG') return 'png'
  return null
}

function removeAvatarFile(url) {
  if (!url || !AVATAR_URL_RE.test(url)) return
  try { unlinkSync(join(UPLOAD_DIR, url.replace('/uploads/', ''))) } catch { /* already gone */ }
}

async function handleAvatar(req, res, auth) {
  if (!requireAuth(res, auth)) return
  const { image } = await readBody(req)
  const m = typeof image === 'string' && image.match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/)
  if (!m) return bad(res, '图片格式不支持，请使用 PNG / JPG / WebP')
  const buf = Buffer.from(m[1], 'base64')
  if (buf.length > AVATAR_MAX) return bad(res, '头像过大，请重新裁切', 413)
  const ext = sniffImage(buf)
  if (!ext) return bad(res, '文件内容不是有效图片')

  const name = `${auth.user.id}-${randomBytes(6).toString('hex')}.${ext}`
  writeFileSync(join(UPLOAD_DIR, name), buf)
  removeAvatarFile(auth.user.avatar)
  updateUser(auth.user.id, { avatar: `/uploads/${name}` })
  send(res, 200, { user: findUserById(auth.user.id) })
}

export function handleUpload(req, res, url) {
  const name = decodeURIComponent(url.pathname.replace(/^\/uploads\//, ''))
  if (!/^[a-zA-Z0-9_-]+\.(png|jpg|webp)$/.test(name)) {
    res.writeHead(404); return res.end()
  }
  const file = join(UPLOAD_DIR, name)
  if (!existsSync(file)) { res.writeHead(404); return res.end() }
  const type = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[name.split('.').pop()]
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  })
  res.end(readFileSync(file))
}

function validateUsername(username) {
  if (!username || !USERNAME_RE.test(username)) {
    return '用户名为 3-20 个字符，只能包含字母、数字、下划线、连字符'
  }
  return null
}

/* ------------------------------------------------------------------ */
/* admin endpoints                                                     */
/* ------------------------------------------------------------------ */

async function handleListUsers(req, res, auth) {
  if (!requireAuth(res, auth, 'admin')) return
  const users = listUsersWithStats()
  send(res, 200, { users, registrationOpen: getSetting('registrationOpen', '1') === '1' })
}

async function handleCreateUser(req, res, auth) {
  if (!requireAuth(res, auth, 'admin')) return
  const { username, password, displayName, role } = await readBody(req)

  const usernameErr = validateUsername(username)
  if (usernameErr) return bad(res, usernameErr)

  if (findUserByUsername(username)) {
    return bad(res, '用户名已被占用', 409)
  }

  const pwdErr = validatePassword(password)
  if (pwdErr) return bad(res, pwdErr)

  const userId = nanoid()
  const user = createUser({
    id: userId,
    username: str(username, 'username'),
    displayName: str(displayName, 'displayName'),
    passwordHash: hashPassword(password),
    role: role === 'admin' ? 'admin' : 'user',
    createdAt: nowISO(),
  })

  seedDefaultCategories(userId)
  send(res, 201, { user })
}

async function handleUpdateUser(req, res, auth, targetId) {
  if (!requireAuth(res, auth, 'admin')) return

  const target = findUserById(targetId)
  if (!target) return bad(res, 'not found', 404)

  if (targetId === auth.user.id) {
    return bad(res, '不能修改自己的角色或状态', 400)
  }

  const { displayName, email, role, status, resetPassword } = await readBody(req)
  const patch = {}
  if (displayName !== undefined) patch.displayName = str(displayName, 'displayName')
  if (email !== undefined) patch.email = email || null
  if (role !== undefined) {
    if (target.role === 'admin' && role !== 'admin' && adminCount() <= 1) {
      return bad(res, '至少保留一个管理员账号', 400)
    }
    patch.role = role === 'admin' ? 'admin' : 'user'
  }
  if (status !== undefined) {
    if (target.role === 'admin' && status === 'disabled' && adminCount() <= 1) {
      return bad(res, '至少保留一个管理员账号', 400)
    }
    patch.status = status === 'active' ? 'active' : 'disabled'
    if (patch.status === 'disabled') {
      deleteSessionsForUser(targetId)
    }
  }
  if (resetPassword) {
    const pwdErr = validatePassword(resetPassword)
    if (pwdErr) return bad(res, pwdErr)
    patch.passwordHash = hashPassword(resetPassword)
    deleteSessionsForUser(targetId)
  }

  updateUser(targetId, patch)
  send(res, 200, { user: findUserById(targetId) })
}

async function handleDeleteUser(req, res, auth, targetId) {
  if (!requireAuth(res, auth, 'admin')) return

  if (targetId === auth.user.id) {
    return bad(res, '不能删除自己', 400)
  }

  const target = findUserById(targetId)
  if (!target) return bad(res, 'not found', 404)

  if (target.role === 'admin' && adminCount() <= 1) {
    return bad(res, '至少保留一个管理员账号', 400)
  }

  removeAvatarFile(target.avatar)
  deleteUser(targetId)
  send(res, 200, { ok: true })
}

async function handleGetSettings(req, res, auth) {
  if (!requireAuth(res, auth, 'admin')) return
  send(res, 200, {
    registrationOpen: getSetting('registrationOpen', '1') === '1',
  })
}

async function handleUpdateSettings(req, res, auth) {
  if (!requireAuth(res, auth, 'admin')) return
  const { registrationOpen } = await readBody(req)
  if (registrationOpen !== undefined) {
    setSetting('registrationOpen', registrationOpen ? '1' : '0')
  }
  send(res, 200, { ok: true })
}

/* ------------------------------------------------------------------ */
/* router                                                              */
/* ------------------------------------------------------------------ */

export async function handleAuthApi(req, res, url) {
  const path = url.pathname.replace(/^\/api\/auth/, '') || '/'
  const method = req.method || 'GET'

  try {
    const auth = await authenticate(req)

    if (path === '/setup-status' && method === 'GET') {
      return await handleSetupStatus(res)
    }
    if (path === '/setup' && method === 'POST') {
      return await handleSetup(req, res)
    }
    if (path === '/register' && method === 'POST') {
      return await handleRegister(req, res)
    }
    if (path === '/login' && method === 'POST') {
      return await handleLogin(req, res)
    }
    if (path === '/logout' && method === 'POST') {
      return await handleLogout(req, res, auth)
    }
    if (path === '/me' && method === 'GET') {
      return await handleMe(req, res, auth)
    }
    if (path === '/me' && method === 'PATCH') {
      return await handleUpdateMe(req, res, auth)
    }
    if (path === '/avatar' && method === 'POST') {
      return await handleAvatar(req, res, auth)
    }
    if (path === '/password' && method === 'POST') {
      return await handleChangePassword(req, res, auth)
    }

    return bad(res, `no route for ${method} ${path}`, 404)
  } catch (err) {
    const status = err.status ?? 500
    if (status >= 500) console.error('[zhiri auth]', err)
    return send(res, status, { error: err.message ?? 'internal error' })
  }
}

export async function handleAdminApi(req, res, url) {
  const path = url.pathname.replace(/^\/api\/admin/, '') || '/'
  const method = req.method || 'GET'

  try {
    const auth = await authenticate(req)

    if (path === '/users' && method === 'GET') {
      return await handleListUsers(req, res, auth)
    }
    if (path === '/users' && method === 'POST') {
      return await handleCreateUser(req, res, auth)
    }
    if (path.startsWith('/users/') && method === 'PATCH') {
      const id = decodeURIComponent(path.replace('/users/', ''))
      return await handleUpdateUser(req, res, auth, id)
    }
    if (path.startsWith('/users/') && method === 'DELETE') {
      const id = decodeURIComponent(path.replace('/users/', ''))
      return await handleDeleteUser(req, res, auth, id)
    }
    if (path === '/settings' && method === 'GET') {
      return await handleGetSettings(req, res, auth)
    }
    if (path === '/settings' && method === 'PATCH') {
      return await handleUpdateSettings(req, res, auth)
    }

    return bad(res, `no route for ${method} ${path}`, 404)
  } catch (err) {
    const status = err.status ?? 500
    if (status >= 500) console.error('[zhiri admin]', err)
    return send(res, status, { error: err.message ?? 'internal error' })
  }
}

export { authenticate }
