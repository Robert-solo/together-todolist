import type { TimeEntry, Inspiration, Category } from '../types'
import { useAuthStore } from '../store/authStore'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (res.status === 401) useAuthStore.getState().forceLogout()
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (body?.error) detail = body.error
    } catch { /* non-JSON error body */ }
    throw new Error(`${res.status} ${detail}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

const json = (body: unknown) => ({ body: JSON.stringify(body) })

export interface Snapshot {
  entries: TimeEntry[]
  inspirations: Inspiration[]
  categories: Category[]
}

export const api = {
  getState: () => request<Snapshot>('/state'),

  importLegacy: (snap: Snapshot) =>
    request<{ imported: boolean; state: Snapshot }>('/state/import', {
      method: 'POST',
      ...json(snap),
    }),

  addEntry: (e: TimeEntry) =>
    request<TimeEntry>('/entries', { method: 'POST', ...json(e) }),
  updateEntry: (id: string, e: Omit<TimeEntry, 'id' | 'createdAt'>) =>
    request<{ ok: true }>(`/entries/${encodeURIComponent(id)}`, {
      method: 'PUT',
      ...json(e),
    }),
  deleteEntry: (id: string) =>
    request<{ ok: true }>(`/entries/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  addInspiration: (i: Inspiration) =>
    request<Inspiration>('/inspirations', { method: 'POST', ...json(i) }),
  deleteInspiration: (id: string) =>
    request<{ ok: true }>(`/inspirations/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  addCategory: (c: Category) =>
    request<Category>('/categories', { method: 'POST', ...json(c) }),
  updateCategory: (id: string, c: Category) =>
    request<{ ok: true }>(`/categories/${encodeURIComponent(id)}`, {
      method: 'PUT',
      ...json(c),
    }),
  deleteCategory: (id: string) =>
    request<{ ok: true }>(`/categories/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}
