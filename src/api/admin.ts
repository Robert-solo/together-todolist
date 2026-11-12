export interface SetupStatus {
  needsSetup: boolean
  hasOrphanData: boolean
  registrationOpen: boolean
}

export interface AdminUserStats {
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
  entryCount: number
  inspirationCount: number
  categoryCount: number
}

export interface AdminSettings {
  registrationOpen: boolean
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
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

export const adminApi = {
  listUsers: () =>
    request<{ users: AdminUserStats[]; registrationOpen: boolean }>('/users'),

  createUser: (data: {
    username: string
    password: string
    displayName: string
    role?: 'admin' | 'user'
  }) => request<{ user: AdminUserStats }>('/users', { method: 'POST', ...json(data) }),

  updateUser: (
    id: string,
    data: {
      displayName?: string
      email?: string
      role?: 'admin' | 'user'
      status?: 'active' | 'disabled'
      resetPassword?: string
    }
  ) => request<{ user: AdminUserStats }>(`/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    ...json(data),
  }),

  deleteUser: (id: string) =>
    request<{ ok: true }>(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  getSettings: () => request<AdminSettings>('/settings'),

  updateSettings: (data: { registrationOpen?: boolean }) =>
    request<{ ok: true }>('/settings', { method: 'PATCH', ...json(data) }),
}

export async function checkSetupStatus(): Promise<SetupStatus> {
  const res = await fetch('/api/auth/setup-status', { credentials: 'same-origin' })
  if (!res.ok) throw new Error('Failed to check setup status')
  return res.json()
}
