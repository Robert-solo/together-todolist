import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export const DB_PATH =
  process.env.ZHIRI_DB ?? join(here, '..', 'data', 'zhiri.db')
export const UPLOAD_DIR =
  process.env.ZHIRI_UPLOADS ?? join(here, '..', 'data', 'uploads')

mkdirSync(dirname(DB_PATH), { recursive: true })
mkdirSync(UPLOAD_DIR, { recursive: true })

export const db = new DatabaseSync(DB_PATH)

db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')

const nowISO = () => new Date().toISOString()

/* ------------------------------------------------------------------ */
/* schema helpers                                                       */
/* ------------------------------------------------------------------ */

const tableExists = (name) =>
  !!db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name)

const tableColumns = (name) =>
  tableExists(name)
    ? db.prepare(`SELECT name FROM pragma_table_info('${name}')`).all().map((r) => r.name)
    : []

/* ------------------------------------------------------------------ */
/* tables                                                               */
/* ------------------------------------------------------------------ */

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    username     TEXT NOT NULL UNIQUE COLLATE NOCASE,
    displayName  TEXT NOT NULL,
    email        TEXT COLLATE NOCASE,
    passwordHash TEXT NOT NULL,
    avatar       TEXT NOT NULL DEFAULT '',
    bio          TEXT NOT NULL DEFAULT '',
    role         TEXT NOT NULL DEFAULT 'user'   CHECK (role IN ('admin','user')),
    status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
    createdAt    TEXT NOT NULL,
    lastLoginAt  TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email
    ON users(email) WHERE email IS NOT NULL AND email <> '';

  CREATE TABLE IF NOT EXISTS sessions (
    tokenHash  TEXT PRIMARY KEY,
    userId     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    createdAt  TEXT NOT NULL,
    expiresAt  TEXT NOT NULL,
    lastSeenAt TEXT NOT NULL,
    userAgent  TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);
  CREATE INDEX IF NOT EXISTS idx_sessions_exp  ON sessions(expiresAt);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    userId    TEXT NOT NULL DEFAULT '',
    id        TEXT NOT NULL,
    name      TEXT NOT NULL,
    color     TEXT NOT NULL,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (userId, id)
  );

  CREATE TABLE IF NOT EXISTS entries (
    id         TEXT PRIMARY KEY,
    userId     TEXT NOT NULL DEFAULT '',
    startTime  TEXT NOT NULL,
    endTime    TEXT,
    title      TEXT NOT NULL,
    memo       TEXT NOT NULL DEFAULT '',
    categoryId TEXT NOT NULL,
    createdAt  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inspirations (
    id            TEXT PRIMARY KEY,
    userId        TEXT NOT NULL DEFAULT '',
    content       TEXT NOT NULL,
    createdAt     TEXT NOT NULL,
    linkedEntryId TEXT
  );
`)

/* ------------------------------------------------------------------ */
/* migrations from the single-user schema                              */
/* ------------------------------------------------------------------ */

/** categories predates multi-user and used a bare `id` primary key. */
function migrateCategoriesTable() {
  const cols = tableColumns('categories')
  if (!cols.length || cols.includes('userId')) return

  db.exec('BEGIN')
  try {
    db.exec(`
      CREATE TABLE categories_migration (
        userId    TEXT NOT NULL DEFAULT '',
        id        TEXT NOT NULL,
        name      TEXT NOT NULL,
        color     TEXT NOT NULL,
        sortOrder INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (userId, id)
      )
    `)
    db.exec(`
      INSERT INTO categories_migration (userId, id, name, color, sortOrder)
      SELECT '', id, name, color, sortOrder FROM categories
    `)
    db.exec('DROP TABLE categories')
    db.exec('ALTER TABLE categories_migration RENAME TO categories')
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

function addUserIdColumn(table) {
  const cols = tableColumns(table)
  if (!cols.length || cols.includes('userId')) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN userId TEXT NOT NULL DEFAULT ''`)
}

migrateCategoriesTable()
addUserIdColumn('entries')
addUserIdColumn('inspirations')

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_entries_user_start ON entries(userId, startTime);
  CREATE INDEX IF NOT EXISTS idx_insp_user_created  ON inspirations(userId, createdAt);
  CREATE INDEX IF NOT EXISTS idx_cat_user_order     ON categories(userId, sortOrder);
`)

db.prepare('DELETE FROM sessions WHERE expiresAt < ?').run(nowISO())
if (!db.prepare("SELECT value FROM settings WHERE key = 'registrationOpen'").get()) {
  db.prepare("INSERT INTO settings (key, value) VALUES ('registrationOpen', '1')").run()
}

/* ------------------------------------------------------------------ */
/* default categories                                                  */
/* ------------------------------------------------------------------ */

export const DEFAULT_CATEGORIES = [
  { id: 'research', name: '科研', color: 'var(--cat-research)', sortOrder: 0 },
  { id: 'study', name: '学习', color: 'var(--cat-study)', sortOrder: 1 },
  { id: 'work', name: '工作', color: 'var(--cat-work)', sortOrder: 2 },
  { id: 'sport', name: '运动', color: 'var(--cat-sport)', sortOrder: 3 },
  { id: 'life', name: '生活', color: 'var(--cat-life)', sortOrder: 4 },
  { id: 'social', name: '社交', color: 'var(--cat-social)', sortOrder: 5 },
  { id: 'leisure', name: '娱乐', color: 'var(--cat-leisure)', sortOrder: 6 },
  { id: 'other', name: '其他', color: 'var(--cat-other)', sortOrder: 7 },
]

/* ------------------------------------------------------------------ */
/* row mappers                                                         */
/* ------------------------------------------------------------------ */

const toEntry = (r) => ({
  id: r.id,
  startTime: r.startTime,
  endTime: r.endTime ?? null,
  title: r.title,
  memo: r.memo,
  categoryId: r.categoryId,
  createdAt: r.createdAt,
})

const toInsp = (r) => ({
  id: r.id,
  content: r.content,
  createdAt: r.createdAt,
  ...(r.linkedEntryId ? { linkedEntryId: r.linkedEntryId } : {}),
})

const toCat = (r) => ({
  id: r.id,
  name: r.name,
  color: r.color,
  order: r.sortOrder,
})

const toUser = (r) =>
  r
    ? {
        id: r.id,
        username: r.username,
        displayName: r.displayName,
        email: r.email ?? '',
        avatar: r.avatar ?? '',
        bio: r.bio ?? '',
        role: r.role,
        status: r.status,
        createdAt: r.createdAt,
        lastLoginAt: r.lastLoginAt ?? null,
      }
    : null

/* ------------------------------------------------------------------ */
/* users                                                               */
/* ------------------------------------------------------------------ */

const insertUserStmt = db.prepare(`
  INSERT INTO users (id, username, displayName, email, passwordHash, avatar, bio, role, status, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

export function createUser(u) {
  insertUserStmt.run(
    u.id,
    u.username,
    u.displayName,
    u.email || null,
    u.passwordHash,
    u.avatar ?? '',
    u.bio ?? '',
    u.role ?? 'user',
    u.status ?? 'active',
    u.createdAt ?? nowISO()
  )
  return findUserById(u.id)
}

export const countUsers = () =>
  db.prepare('SELECT COUNT(*) AS n FROM users').get().n

export const findUserByUsername = (username) =>
  toUser(db.prepare('SELECT * FROM users WHERE username = ?').get(username))

export const findUserById = (id) =>
  toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id))

const findUserRowById = (id) =>
  db.prepare('SELECT * FROM users WHERE id = ?').get(id)

/** Raw password hash — never leaves the server layer. */
export const getPasswordHash = (id) => findUserRowById(id)?.passwordHash ?? null

export function listUsersWithStats() {
  const users = db.prepare('SELECT * FROM users ORDER BY createdAt').all().map(toUser)

  const tally = (sql) =>
    new Map(
      db
        .prepare(sql)
        .all()
        .map((r) => [r.userId, r.n])
    )

  const entryCount = tally('SELECT userId, COUNT(*) AS n FROM entries GROUP BY userId')
  const inspCount = tally('SELECT userId, COUNT(*) AS n FROM inspirations GROUP BY userId')
  const catCount = tally('SELECT userId, COUNT(*) AS n FROM categories GROUP BY userId')

  return users.map((u) => ({
    ...u,
    entryCount: entryCount.get(u.id) ?? 0,
    inspirationCount: inspCount.get(u.id) ?? 0,
    categoryCount: catCount.get(u.id) ?? 0,
  }))
}

const USER_PATCH_COLUMNS = {
  displayName: 'displayName',
  email: 'email',
  avatar: 'avatar',
  bio: 'bio',
  role: 'role',
  status: 'status',
  passwordHash: 'passwordHash',
  lastLoginAt: 'lastLoginAt',
}

export function updateUser(id, patch) {
  const sets = []
  const values = []
  for (const [key, column] of Object.entries(USER_PATCH_COLUMNS)) {
    if (patch[key] === undefined) continue
    sets.push(`${column} = ?`)
    values.push(patch[key])
  }
  if (!sets.length) return false
  values.push(id)
  const r = db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values)
  return r.changes > 0
}

export function deleteUser(id) {
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM entries WHERE userId = ?').run(id)
    db.prepare('DELETE FROM inspirations WHERE userId = ?').run(id)
    db.prepare('DELETE FROM categories WHERE userId = ?').run(id)
    db.prepare('DELETE FROM sessions WHERE userId = ?').run(id)
    const r = db.prepare('DELETE FROM users WHERE id = ?').run(id)
    db.exec('COMMIT')
    return r.changes > 0
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export const adminCount = () =>
  db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'").get().n

/* ------------------------------------------------------------------ */
/* sessions                                                            */
/* ------------------------------------------------------------------ */

export function createSession({ tokenHash, userId, expiresAt, userAgent }) {
  const ts = nowISO()
  db.prepare(`
    INSERT INTO sessions (tokenHash, userId, createdAt, expiresAt, lastSeenAt, userAgent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(tokenHash, userId, ts, expiresAt, ts, userAgent ?? '')
}

export function findSession(tokenHash) {
  const row = db
    .prepare('SELECT * FROM sessions WHERE tokenHash = ?')
    .get(tokenHash)
  if (!row) return null
  if (row.expiresAt <= nowISO()) {
    db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(tokenHash)
    return null
  }
  return row
}

export const touchSession = (tokenHash) =>
  db.prepare('UPDATE sessions SET lastSeenAt = ? WHERE tokenHash = ?').run(nowISO(), tokenHash)

export const deleteSession = (tokenHash) =>
  db.prepare('DELETE FROM sessions WHERE tokenHash = ?').run(tokenHash)

export const deleteSessionsForUser = (userId) =>
  db.prepare('DELETE FROM sessions WHERE userId = ?').run(userId)

export const deleteOtherSessions = (userId, keepTokenHash) =>
  db
    .prepare('DELETE FROM sessions WHERE userId = ? AND tokenHash <> ?')
    .run(userId, keepTokenHash)

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */

export const getSetting = (key, fallback = '') => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  return row ? row.value : fallback
}

export const setSetting = (key, value) =>
  db
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value))

/* ------------------------------------------------------------------ */
/* per-user data                                                       */
/* ------------------------------------------------------------------ */

export function readState(userId) {
  return {
    entries: db
      .prepare('SELECT * FROM entries WHERE userId = ? ORDER BY startTime')
      .all(userId)
      .map(toEntry),
    inspirations: db
      .prepare('SELECT * FROM inspirations WHERE userId = ? ORDER BY createdAt DESC')
      .all(userId)
      .map(toInsp),
    categories: db
      .prepare('SELECT * FROM categories WHERE userId = ? ORDER BY sortOrder, rowid')
      .all(userId)
      .map(toCat),
  }
}

export function userHasData(userId) {
  const e = db.prepare('SELECT COUNT(*) AS n FROM entries WHERE userId = ?').get(userId).n
  const i = db.prepare('SELECT COUNT(*) AS n FROM inspirations WHERE userId = ?').get(userId).n
  return e > 0 || i > 0
}

const insertEntryStmt = db.prepare(`
  INSERT OR REPLACE INTO entries (id, userId, startTime, endTime, title, memo, categoryId, createdAt)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

export function insertEntry(userId, e) {
  insertEntryStmt.run(
    e.id,
    userId,
    e.startTime,
    e.endTime ?? null,
    e.title,
    e.memo ?? '',
    e.categoryId,
    e.createdAt
  )
}

export function updateEntry(userId, id, e) {
  const r = db
    .prepare(`
      UPDATE entries
         SET startTime = ?, endTime = ?, title = ?, memo = ?, categoryId = ?
       WHERE id = ? AND userId = ?
    `)
    .run(e.startTime, e.endTime ?? null, e.title, e.memo ?? '', e.categoryId, id, userId)
  return r.changes > 0
}

export function deleteEntry(userId, id) {
  return (
    db.prepare('DELETE FROM entries WHERE id = ? AND userId = ?').run(id, userId).changes > 0
  )
}

const insertInspStmt = db.prepare(`
  INSERT OR REPLACE INTO inspirations (id, userId, content, createdAt, linkedEntryId)
  VALUES (?, ?, ?, ?, ?)
`)

export function insertInspiration(userId, i) {
  insertInspStmt.run(i.id, userId, i.content, i.createdAt, i.linkedEntryId ?? null)
}

export function deleteInspiration(userId, id) {
  return (
    db
      .prepare('DELETE FROM inspirations WHERE id = ? AND userId = ?')
      .run(id, userId).changes > 0
  )
}

const insertCatStmt = db.prepare(
  'INSERT OR REPLACE INTO categories (userId, id, name, color, sortOrder) VALUES (?, ?, ?, ?, ?)'
)

export function insertCategory(userId, c) {
  insertCatStmt.run(userId, c.id, c.name, c.color, c.order ?? 0)
}

export function updateCategory(userId, id, c) {
  const r = db
    .prepare('UPDATE categories SET name = ?, color = ?, sortOrder = ? WHERE id = ? AND userId = ?')
    .run(c.name, c.color, c.order ?? 0, id, userId)
  return r.changes > 0
}

export function deleteCategory(userId, id) {
  return (
    db.prepare('DELETE FROM categories WHERE id = ? AND userId = ?').run(id, userId).changes > 0
  )
}

export function seedDefaultCategories(userId) {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO categories (userId, id, name, color, sortOrder) VALUES (?, ?, ?, ?, ?)'
  )
  for (const c of DEFAULT_CATEGORIES) {
    stmt.run(userId, c.id, c.name, c.color, c.sortOrder)
  }
}

/** Hand the pre-multiuser rows over to the first account created. */
export function claimOrphanData(userId) {
  db.exec('BEGIN')
  try {
    // Keep the user's own category names/colours; defaults are seeded afterwards
    // with INSERT OR IGNORE so only missing ones are added.
    db.prepare("UPDATE categories SET userId = ? WHERE userId = ''").run(userId)
    db.prepare("UPDATE entries SET userId = ? WHERE userId = ''").run(userId)
    db.prepare("UPDATE inspirations SET userId = ? WHERE userId = ''").run(userId)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function importLegacy(userId, { entries = [], inspirations = [], categories = [] }) {
  if (userHasData(userId)) return false
  db.exec('BEGIN')
  try {
    for (const c of categories) insertCategory(userId, c)
    for (const e of entries) insertEntry(userId, e)
    for (const i of inspirations) insertInspiration(userId, i)
    db.exec('COMMIT')
    return true
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export const orphanDataExists = () =>
  db.prepare("SELECT COUNT(*) AS n FROM entries WHERE userId = ''").get().n > 0 ||
  db.prepare("SELECT COUNT(*) AS n FROM categories WHERE userId = ''").get().n > 0
