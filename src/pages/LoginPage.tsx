import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { checkSetupStatus } from '../api/admin'
import s from './LoginPage.module.css'

export function LoginPage() {
  const navigate = useNavigate()
  const { user, login, register, loading, error } = useAuthStore()
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [registrationOpen, setRegistrationOpen] = useState(true)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (user) {
      navigate('/week', { replace: true })
      return
    }
    checkSetupStatus()
      .then((status) => {
        if (status.needsSetup) {
          navigate('/setup', { replace: true })
        } else {
          setRegistrationOpen(status.registrationOpen)
          setChecking(false)
        }
      })
      .catch(() => {
        setChecking(false)
      })
  }, [user, navigate])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await login(username, password)
    if (result.ok) {
      navigate('/week', { replace: true })
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      return
    }
    const result = await register(username, password, displayName)
    if (result.ok) {
      navigate('/week', { replace: true })
    }
  }

  if (checking) {
    return (
      <div className={s.container}>
        <div className={s.loading}>正在加载…</div>
      </div>
    )
  }

  return (
    <div className={s.container}>
      <div className={s.card}>
        <div className={s.brand}>
          <div className={s.logo}>
            <img src="/together-icon.svg?v=2" alt="" width={64} height={64} />
          </div>
          <h1 className={s.title}>Together Todolist</h1>
          <p className={s.subtitle}>一起把时间用在值得的地方</p>
        </div>

        <div className={s.tabs}>
          <button
            className={`${s.tab} ${tab === 'login' ? s.active : ''}`}
            onClick={() => setTab('login')}
          >
            登录
          </button>
          <button
            className={`${s.tab} ${tab === 'register' ? s.active : ''}`}
            onClick={() => setTab('register')}
            disabled={!registrationOpen}
          >
            注册
          </button>
        </div>

        {tab === 'login' ? (
          <form className={s.form} onSubmit={handleLogin}>
            {error && <div className={s.error}>{error}</div>}

            <div className={s.field}>
              <label className={s.label}>用户名</label>
              <input
                className={s.input}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="输入用户名"
                required
                autoFocus
              />
            </div>

            <div className={s.field}>
              <label className={s.label}>密码</label>
              <input
                type="password"
                className={s.input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="输入密码"
                required
              />
            </div>

            <button
              type="submit"
              className={s.submitBtn}
              disabled={loading || !username || !password}
            >
              {loading ? '登录中…' : '登录'}
            </button>
          </form>
        ) : (
          <form className={s.form} onSubmit={handleRegister}>
            {error && <div className={s.error}>{error}</div>}
            {!registrationOpen && (
              <div className={s.notice}>注册功能已关闭，请联系管理员</div>
            )}

            <div className={s.field}>
              <label className={s.label}>用户名</label>
              <input
                className={s.input}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="3-20个字符，字母数字下划线"
                required
                autoFocus
              />
            </div>

            <div className={s.field}>
              <label className={s.label}>昵称</label>
              <input
                className={s.input}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="显示名称"
                required
              />
            </div>

            <div className={s.field}>
              <label className={s.label}>密码</label>
              <input
                type="password"
                className={s.input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 位"
                required
              />
            </div>

            <div className={s.field}>
              <label className={s.label}>确认密码</label>
              <input
                type="password"
                className={s.input}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再次输入密码"
                required
              />
              {password && confirmPassword && password !== confirmPassword && (
                <div className={s.hint}>两次密码不一致</div>
              )}
            </div>

            <button
              type="submit"
              className={s.submitBtn}
              disabled={loading || !username || !password || password !== confirmPassword}
            >
              {loading ? '注册中…' : '注册'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
