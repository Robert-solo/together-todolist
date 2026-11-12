import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout/Layout'
import { RequireAuth } from './components/Auth/RequireAuth'
import { SetupPage } from './pages/SetupPage'
import { LoginPage } from './pages/LoginPage'
import { WeekPage } from './pages/WeekPage'
import { DayPage } from './pages/DayPage'
import { MonthPage } from './pages/MonthPage'
import { StatsPage } from './pages/StatsPage'
import { ProfilePage } from './pages/ProfilePage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { useAuthStore } from './store/authStore'
import { useEntryStore } from './store/entryStore'

export default function App() {
  const { initialized, user, checkSession } = useAuthStore()
  const { ready, error, load, reset } = useEntryStore()

  useEffect(() => {
    void checkSession()
  }, [checkSession])

  // Load (or reload) the snapshot whenever the signed-in account changes.
  const userId = user?.id
  useEffect(() => {
    reset()
    if (userId) void load()
  }, [userId, load, reset])

  if (!initialized || (user && !ready)) {
    return (
      <div style={{
        display: 'grid', placeItems: 'center', height: '100vh',
        color: 'var(--c-muted)', fontSize: '0.85rem',
      }}>
        正在初始化…
      </div>
    )
  }

  if (user && error) {
    return (
      <div style={{
        display: 'grid', placeItems: 'center', height: '100vh',
        color: 'var(--c-body)', fontSize: '0.85rem', textAlign: 'center',
        padding: 24, lineHeight: 1.7,
      }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>无法连接数据服务</div>
          <div style={{ color: 'var(--c-muted)' }}>{error}</div>
          <button
            onClick={() => { void load() }}
            style={{
              marginTop: 16, padding: '6px 16px', borderRadius: 99,
              background: 'var(--c-accent-1)', color: '#fff', fontWeight: 500,
            }}
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/*" element={
        <RequireAuth>
          <Layout>
            <Routes>
              <Route index element={<Navigate to="/week" replace />} />
              <Route path="day" element={<DayPage />} />
              <Route path="week" element={<WeekPage />} />
              <Route path="month" element={<MonthPage />} />
              <Route path="stats" element={<StatsPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="admin/users" element={
                <RequireAuth requireAdmin><AdminUsersPage /></RequireAuth>
              } />
            </Routes>
          </Layout>
        </RequireAuth>
      } />
    </Routes>
  )
}
