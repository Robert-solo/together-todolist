import { create } from 'zustand'
import type { TimeEntry, Inspiration, Category } from '../types'
import { api } from '../api/client'
import { nanoid } from '../utils/nanoid'
import { findConflict } from '../utils/conflict'

export type WriteError =
  | { kind: 'conflict'; conflict: TimeEntry }
  | { kind: 'invalid'; message: string }

export type WriteResult =
  | { ok: true }
  | { ok: false } & WriteError

interface EntryState {
  entries: TimeEntry[]
  inspirations: Inspiration[]
  categories: Category[]
  ready: boolean
  error: string | null
  load: () => Promise<void>
  reset: () => void
  addEntry: (entry: Omit<TimeEntry, 'id' | 'createdAt'>) => WriteResult
  updateEntry: (id: string, patch: Partial<TimeEntry>) => WriteResult
  deleteEntry: (id: string) => void
  addInspiration: (content: string) => void
  deleteInspiration: (id: string) => void
  addCategory: (cat: Omit<Category, 'order'>) => void
  updateCategory: (id: string, patch: Partial<Category>) => void
  deleteCategory: (id: string) => void
}

const LEGACY_KEYS = ['zhiri-entries', 'zhiri-categories'] as const

const ISO_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/

/**
 * Reject anything that would land in the database as an unusable record.
 * Returns an error message, or null when the entry is fine.
 */
function validate(entry: Omit<TimeEntry, 'id' | 'createdAt'>): string | null {
  const title = entry.title.trim()
  if (!title) return '活动名称不能为空'
  if (title === '无标题') return '请填写活动名称'

  if (!ISO_TIME_RE.test(entry.startTime)) return '开始时间格式不正确'
  if (entry.endTime !== null && !ISO_TIME_RE.test(entry.endTime)) {
    return '结束时间格式不正确'
  }

  if (!entry.endTime) {
    return '请补上结束时间（例如 09:00-10:30）'
  }

  const start = new Date(entry.startTime).getTime()
  const end = new Date(entry.endTime).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '时间无法解析'
  if (end <= start) return '结束时间必须晚于开始时间'
  if (end - start > 7 * 24 * 60 * 60 * 1000) return '单条记录不能超过 7 天'

  return null
}

function readLegacy() {
  const entries: TimeEntry[] = []
  const inspirations: Inspiration[] = []
  const categories: Category[] = []

  try {
    const rawEntries = localStorage.getItem(LEGACY_KEYS[0])
    if (rawEntries) {
      const parsed = JSON.parse(rawEntries)?.state
      if (Array.isArray(parsed?.entries)) entries.push(...parsed.entries)
      if (Array.isArray(parsed?.inspirations)) inspirations.push(...parsed.inspirations)
    }
  } catch { /* unreadable local cache */ }

  try {
    const rawCats = localStorage.getItem(LEGACY_KEYS[1])
    if (rawCats) {
      const parsed = JSON.parse(rawCats)?.state
      if (Array.isArray(parsed?.categories)) categories.push(...parsed.categories)
    }
  } catch { /* unreadable local cache */ }

  return { entries, inspirations, categories }
}

function clearLegacy() {
  for (const key of LEGACY_KEYS) localStorage.removeItem(key)
}

/** Fire-and-forget remote write; the local state is already updated. */
function sync(promise: Promise<unknown>) {
  promise.catch((err) => {
    console.error('[zhiri] sync failed:', err)
  })
}

export const useEntryStore = create<EntryState>()((set, get) => ({
  entries: [],
  inspirations: [],
  categories: [],
  ready: false,
  error: null,

  reset: () =>
    set({ entries: [], inspirations: [], categories: [], ready: false, error: null }),

  load: async () => {
    try {
      let snapshot = await api.getState()

      // First run against a fresh database: adopt whatever the browser had.
      if (snapshot.entries.length === 0 && snapshot.inspirations.length === 0) {
        const legacy = readLegacy()
        if (legacy.entries.length || legacy.inspirations.length || legacy.categories.length) {
          const result = await api.importLegacy(legacy)
          snapshot = result.state
          clearLegacy()
        }
      }

      const { categories } = get()
      set({
        entries: snapshot.entries,
        inspirations: snapshot.inspirations,
        categories: snapshot.categories.length ? snapshot.categories : categories,
        ready: true,
        error: null,
      })
    } catch (err) {
      console.error('[zhiri] load failed:', err)
      set({ ready: true, error: (err as Error).message })
    }
  },

  addEntry: (entry) => {
    const invalid = validate(entry)
    if (invalid) return { ok: false, kind: 'invalid', message: invalid }

    const conflict = findConflict(get().entries, entry)
    if (conflict) return { ok: false, kind: 'conflict', conflict }

    const full: TimeEntry = {
      ...entry,
      title: entry.title.trim(),
      memo: entry.memo.trim(),
      id: nanoid(),
      createdAt: new Date().toISOString(),
    }
    set((s) => ({ entries: [...s.entries, full] }))
    sync(api.addEntry(full))
    return { ok: true }
  },

  updateEntry: (id, patch) => {
    const current = get().entries.find((e) => e.id === id)
    if (!current) return { ok: true }

    const next = { ...current, ...patch }
    const invalid = validate(next)
    if (invalid) return { ok: false, kind: 'invalid', message: invalid }

    const conflict = findConflict(get().entries, next, id)
    if (conflict) return { ok: false, kind: 'conflict', conflict }

    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }))
    sync(
      api.updateEntry(id, {
        startTime: next.startTime,
        endTime: next.endTime,
        title: next.title,
        memo: next.memo,
        categoryId: next.categoryId,
      })
    )
    return { ok: true }
  },

  deleteEntry: (id) => {
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }))
    sync(api.deleteEntry(id))
  },

  addInspiration: (content) => {
    const full: Inspiration = {
      id: nanoid(),
      content,
      createdAt: new Date().toISOString(),
    }
    set((s) => ({ inspirations: [full, ...s.inspirations] }))
    sync(api.addInspiration(full))
  },

  deleteInspiration: (id) => {
    set((s) => ({ inspirations: s.inspirations.filter((i) => i.id !== id) }))
    sync(api.deleteInspiration(id))
  },

  addCategory: (cat) => {
    const full: Category = { ...cat, order: get().categories.length }
    set((s) => ({ categories: [...s.categories, full] }))
    sync(api.addCategory(full))
  },

  updateCategory: (id, patch) => {
    set((s) => ({
      categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))
    const updated = get().categories.find((c) => c.id === id)
    if (updated) sync(api.updateCategory(id, updated))
  },

  deleteCategory: (id) => {
    set((s) => ({
      categories: s.categories
        .filter((c) => c.id !== id)
        .map((c, i) => ({ ...c, order: i })),
    }))
    sync(api.deleteCategory(id))
  },
}))
