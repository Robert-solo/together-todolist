import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { checkSetupStatus } from '../api/admin'
import s from './SetupPage.module.css'

export function SetupPage() {
  const navigate = useNavigate()
  const { user, setup, loading, error } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [hasOrphanData, setHasOrphanData] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (user) {
      navigate('/week', { replace: true })
      return
    }
    checkSetupStatus()
      .then((status) => {
        if (!status.needsSetup) {
          navigate('/login', { replace: true })
        } else {
          setHasOrphanData(status.hasOrphanData)
          setChecking(false)
        }
      })
      .catch(() => {
        setChecking(false)
      })
  }, [user, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      return
    }
    const result = await setup(username, password, displayName)
    if (result.ok) {
      navigate('/week', { replace: true })
    }
  }

  if (checking) {
    return (
      <div className={s.container}>
        <div className={s.loading}>正在检查初始化状态…</div>
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
          <p className={s.subtitle}>首次设置</p>
        </div>

        {hasOrphanData && (
          <div className={s.notice}>
            检测到已有数据，首个账号将自动接管这些记录
          </div>
        )}

        <form className={s.form} onSubmit={handleSubmit}>
          {error && <div className={s.error}>{error}</div>}

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
            {loading ? '创建中…' : '创建管理员账号'}
          </button>
        </form>

        <div className={s.footer}>
          首个账号将自动设为管理员，拥有账号管理权限
        </div>
      </div>
    </div>
  )
}
