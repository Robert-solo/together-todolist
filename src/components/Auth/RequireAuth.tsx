import { ReactNode, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

interface Props {
  children: ReactNode
  requireAdmin?: boolean
}

export function RequireAuth({ children, requireAdmin = false }: Props) {
  const { user, initialized, loading } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (!initialized || loading) return

    if (!user) {
      navigate('/login', { replace: true })
      return
    }

    if (requireAdmin && user.role !== 'admin') {
      navigate('/', { replace: true })
    }
  }, [user, initialized, loading, requireAdmin, navigate])

  if (!initialized || loading) {
    return (
      <div style={{
        display: 'grid', placeItems: 'center', height: '100vh',
        color: 'var(--c-muted)', fontSize: '0.85rem',
      }}>
        正在验证身份…
      </div>
    )
  }

  if (!user) return null
  if (requireAdmin && user.role !== 'admin') return null

  return <>{children}</>
}
