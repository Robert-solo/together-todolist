import { create } from 'zustand'

export interface User {
  id: string
  username: string
  displayName: string
  email: string
  avatar: string
  bio: string
  role: 'admin' | 'user'
  status: 'active' | 'disabled'
  createdAt: string
  lastLoginAt: string | null
}

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  initialized: boolean

  checkSession: () => Promise<void>
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  register: (username: string, password: string, displayName: string) => Promise<{ ok: boolean; error?: string }>
  setup: (username: string, password: string, displayName: string) => Promise<{ ok: boolean; error?: string }>
  updateProfile: (patch: Partial<Pick<User, 'displayName' | 'email' | 'bio' | 'avatar'>>) => Promise<void>
  uploadAvatar: (dataUrl: string) => Promise<{ ok: boolean; error?: string }>
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>
  forceLogout: () => void
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/auth${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (body?.error) detail = body.error
    } catch { /* non-JSON */ }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

const json = (body: unknown) => ({ body: JSON.stringify(body) })

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  loading: false,
  error: null,
  initialized: false,

  checkSession: async () => {
    set({ loading: true, error: null })
    try {
      const data = await request<{ user: User }>('/me')
      set({ user: data.user, loading: false, initialized: true })
    } catch (err) {
      set({ user: null, loading: false, error: null, initialized: true })
    }
  },

  login: async (username, password) => {
    set({ loading: true, error: null })
    try {
      const data = await request<{ user: User }>('/login', {
        method: 'POST',
        ...json({ username, password }),
      })
      set({ user: data.user, loading: false, error: null })
      return { ok: true }
    } catch (err) {
      const message = (err as Error).message
      set({ loading: false, error: message })
      return { ok: false, error: message }
    }
  },

  logout: async () => {
    try {
      await request('/logout', { method: 'POST' })
    } catch { /* ignore */ }
    set({ user: null, error: null })
  },

  register: async (username, password, displayName) => {
    set({ loading: true, error: null })
    try {
      const data = await request<{ user: User }>('/register', {
        method: 'POST',
        ...json({ username, password, displayName }),
      })
      set({ user: data.user, loading: false, error: null })
      return { ok: true }
    } catch (err) {
      const message = (err as Error).message
      set({ loading: false, error: message })
      return { ok: false, error: message }
    }
  },

  setup: async (username, password, displayName) => {
    set({ loading: true, error: null })
    try {
      const data = await request<{ user: User }>('/setup', {
        method: 'POST',
        ...json({ username, password, displayName }),
      })
      set({ user: data.user, loading: false, error: null })
      return { ok: true }
    } catch (err) {
      const message = (err as Error).message
      set({ loading: false, error: message })
      return { ok: false, error: message }
    }
  },

  updateProfile: async (patch) => {
    const data = await request<{ user: User }>('/me', {
      method: 'PATCH',
      ...json(patch),
    })
    set({ user: data.user })
  },

  uploadAvatar: async (image) => {
    try {
      const data = await request<{ user: User }>('/avatar', { method: 'POST', ...json({ image }) })
      set({ user: data.user })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  },

  changePassword: async (currentPassword, newPassword) => {
    try {
      await request('/password', {
        method: 'POST',
        ...json({ currentPassword, newPassword }),
      })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  },

  forceLogout: () => {
    set({ user: null, error: null })
  },
}))
