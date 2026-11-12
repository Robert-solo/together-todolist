import {
  readState, insertEntry, updateEntry, deleteEntry,
  insertInspiration, deleteInspiration,
  insertCategory, updateCategory, deleteCategory,
  importLegacy,
} from './db.js'
import { authenticate } from './auth.js'

const MAX_BODY = 2 * 1024 * 1024

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
  if (typeof v !== 'string' || !v.length) throw Object.assign(new Error(`${field} required`), { status: 400 })
  return v
}

function requireAuth(res, auth) {
  if (!auth) {
    bad(res, 'unauthorized', 401)
    return false
  }
  return true
}

/**
 * Two prefixes are accepted:
 *   /api/state             full snapshot
 *   /api/entries[/:id]     CRUD
 * A single "action" endpoint is also supported for convenience:
 *   POST /api/action { type, payload }
 */
export async function handleApi(req, res, url) {
  const path = url.pathname.replace(/^\/api/, '') || '/'
  const method = req.method || 'GET'

  try {
    const auth = await authenticate(req)

    if (path === '/state' && method === 'GET') {
      if (!requireAuth(res, auth)) return
      return send(res, 200, readState(auth.user.id))
    }

    if (path === '/state/import' && method === 'POST') {
      if (!requireAuth(res, auth)) return
      const body = await readBody(req)
      const imported = importLegacy(auth.user.id, body)
      return send(res, imported ? 201 : 409, { imported, state: readState(auth.user.id) })
    }

    if (path === '/action' && method === 'POST') {
      if (!requireAuth(res, auth)) return
      const { type, payload } = await readBody(req)
      return await runAction(res, auth.user.id, type, payload ?? {})
    }

    const seg = path.split('/').filter(Boolean) // ['entries', ':id']

    if (seg[0] === 'entries') {
      if (!requireAuth(res, auth)) return
      if (seg.length === 1 && method === 'POST') {
        const b = await readBody(req)
        const entry = {
          id: str(b.id, 'id'),
          startTime: str(b.startTime, 'startTime'),
          endTime: b.endTime ?? null,
          title: str(b.title, 'title'),
          memo: typeof b.memo === 'string' ? b.memo : '',
          categoryId: str(b.categoryId, 'categoryId'),
          createdAt: str(b.createdAt, 'createdAt'),
        }
        insertEntry(auth.user.id, entry)
        return send(res, 201, entry)
      }
      if (seg.length === 2) {
        const id = decodeURIComponent(seg[1])
        if (method === 'PUT' || method === 'PATCH') {
          const b = await readBody(req)
          const ok = updateEntry(auth.user.id, id, {
            startTime: str(b.startTime, 'startTime'),
            endTime: b.endTime ?? null,
            title: str(b.title, 'title'),
            memo: typeof b.memo === 'string' ? b.memo : '',
            categoryId: str(b.categoryId, 'categoryId'),
          })
          return ok ? send(res, 200, { ok: true }) : bad(res, 'not found', 404)
        }
        if (method === 'DELETE') {
          return deleteEntry(auth.user.id, id) ? send(res, 200, { ok: true }) : bad(res, 'not found', 404)
        }
      }
    }

    if (seg[0] === 'inspirations') {
      if (!requireAuth(res, auth)) return
      if (seg.length === 1 && method === 'POST') {
        const b = await readBody(req)
        const insp = {
          id: str(b.id, 'id'),
          content: str(b.content, 'content'),
          createdAt: str(b.createdAt, 'createdAt'),
          linkedEntryId: b.linkedEntryId || null,
        }
        insertInspiration(auth.user.id, insp)
        return send(res, 201, insp)
      }
      if (seg.length === 2 && method === 'DELETE') {
        const id = decodeURIComponent(seg[1])
        return deleteInspiration(auth.user.id, id) ? send(res, 200, { ok: true }) : bad(res, 'not found', 404)
      }
    }

    if (seg[0] === 'categories') {
      if (!requireAuth(res, auth)) return
      if (seg.length === 1 && method === 'POST') {
        const b = await readBody(req)
        const cat = {
          id: str(b.id, 'id'),
          name: str(b.name, 'name'),
          color: str(b.color, 'color'),
          order: Number.isInteger(b.order) ? b.order : 0,
        }
        insertCategory(auth.user.id, cat)
        return send(res, 201, cat)
      }
      if (seg.length === 2) {
        const id = decodeURIComponent(seg[1])
        if (method === 'PUT' || method === 'PATCH') {
          const b = await readBody(req)
          const ok = updateCategory(auth.user.id, id, {
            name: str(b.name, 'name'),
            color: str(b.color, 'color'),
            order: Number.isInteger(b.order) ? b.order : 0,
          })
          return ok ? send(res, 200, { ok: true }) : bad(res, 'not found', 404)
        }
        if (method === 'DELETE') {
          return deleteCategory(auth.user.id, id) ? send(res, 200, { ok: true }) : bad(res, 'not found', 404)
        }
      }
    }

    return bad(res, `no route for ${method} ${path}`, 404)
  } catch (err) {
    const status = err.status ?? 500
    if (status >= 500) console.error('[zhiri api]', err)
    return send(res, status, { error: err.message ?? 'internal error' })
  }
}

async function runAction(res, userId, type, p) {
  switch (type) {
    case 'entry:add':
      insertEntry(userId, p)
      return send(res, 201, p)
    case 'entry:update':
      return updateEntry(userId, p.id, p) ? send(res, 200, { ok: true }) : bad(res, 'not found', 404)
    case 'entry:delete':
      return deleteEntry(userId, p.id) ? send(res, 200, { ok: true }) : bad(res, 'not found', 404)
    case 'inspiration:add':
      insertInspiration(userId, p)
      return send(res, 201, p)
    case 'inspiration:delete':
      return deleteInspiration(userId, p.id) ? send(res, 200, { ok: true }) : bad(res, 'not found', 404)
    case 'category:add':
      insertCategory(userId, p)
      return send(res, 201, p)
    case 'category:update':
      return updateCategory(userId, p.id, p) ? send(res, 200, { ok: true }) : bad(res, 'not found', 404)
    case 'category:delete':
      return deleteCategory(userId, p.id) ? send(res, 200, { ok: true }) : bad(res, 'not found', 404)
    default:
      return bad(res, `unknown action: ${type}`, 400)
  }
}
