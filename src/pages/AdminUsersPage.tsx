import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { adminApi, type AdminUserStats } from '../api/admin'
import { useAuthStore } from '../store/authStore'
import { Avatar } from '../components/Profile/Avatar'
import s from './AdminUsersPage.module.css'

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; user: AdminUserStats }
  | { kind: 'delete'; user: AdminUserStats }
  | null

export function AdminUsersPage() {
  const navigate = useNavigate()
  const me = useAuthStore((st) => st.user)
  const [users, setUsers] = useState<AdminUserStats[]>([])
  const [registrationOpen, setRegistrationOpen] = useState(true)
  const [q, setQ] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const r = await adminApi.listUsers()
      setUsers(r.users)
      setRegistrationOpen(r.registrationOpen)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    return k ? users.filter((u) => u.username.toLowerCase().includes(k) || u.displayName.toLowerCase().includes(k)) : users
  }, [users, q])

  const toggleRegistration = async (open: boolean) => {
    setRegistrationOpen(open)
    try { await adminApi.updateSettings({ registrationOpen: open }) } catch (e) { setError((e as Error).message); void refresh() }
  }

  return (
    <div className={s.page}>
      <div className={s.inner}>
        <div className={s.head}>
          <div>
            <button className={s.back} onClick={() => navigate('/profile')}>← 个人信息</button>
            <h1 className={s.h1}>账号管理 <small>共 {users.length} 个账号</small></h1>
          </div>
          <button className={s.primary} onClick={() => setDialog({ kind: 'create' })}>+ 新增账号</button>
        </div>

        <div className={s.toolbar}>
          <input className={s.search} placeholder="搜索用户名或昵称" value={q} onChange={(e) => setQ(e.target.value)} />
          <label className={s.switch}>
            <input type="checkbox" checked={registrationOpen} onChange={(e) => toggleRegistration(e.target.checked)} />
            开放注册
          </label>
        </div>

        {error && <div className={s.error}>{error}</div>}

        <div className={s.list}>
          {shown.map((u) => (
            <div key={u.id} className={`${s.item} ${u.status === 'disabled' ? s.disabled : ''}`}>
              <Avatar user={u} size={38} />
              <div className={s.who}>
                <div className={s.nm}>
                  {u.displayName}
                  {u.role === 'admin' && <span className={s.badge}>管理员</span>}
                  {u.status === 'disabled' && <span className={s.badgeOff}>已停用</span>}
                  {u.id === me?.id && <span className={s.badgeMe}>我</span>}
                </div>
                <div className={s.meta}>
                  @{u.username} · {u.entryCount} 条记录 · {u.categoryCount} 个分类 ·{' '}
                  {u.lastLoginAt ? `最近登录 ${format(parseISO(u.lastLoginAt), 'MM-dd HH:mm')}` : '从未登录'}
                </div>
              </div>
              <div className={s.ops}>
                <button onClick={() => setDialog({ kind: 'edit', user: u })}>编辑</button>
                {u.id !== me?.id && <button className={s.del} onClick={() => setDialog({ kind: 'delete', user: u })}>删除</button>}
              </div>
            </div>
          ))}
          {!shown.length && <div className={s.empty}>没有匹配的账号</div>}
        </div>
      </div>

      {dialog && (
        <UserDialog
          dialog={dialog}
          selfId={me?.id}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); void refresh() }}
        />
      )}
    </div>
  )
}

function UserDialog({ dialog, selfId, onClose, onDone }: {
  dialog: NonNullable<Dialog>; selfId?: string; onClose: () => void; onDone: () => void
}) {
  const editing = dialog.kind === 'edit' ? dialog.user : null
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState(editing?.displayName ?? '')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'user'>(editing?.role ?? 'user')
  const [status, setStatus] = useState<'active' | 'disabled'>(editing?.status ?? 'active')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('')
    try { await fn(); onDone() } catch (e) { setErr((e as Error).message); setBusy(false) }
  }

  if (dialog.kind === 'delete') {
    const u = dialog.user
    return (
      <Shell title="删除账号" onClose={onClose}>
        <p className={s.warnText}>
          将永久删除 <b>{u.displayName}</b>（@{u.username}）及其 <b>{u.entryCount}</b> 条记录、
          <b>{u.categoryCount}</b> 个分类、<b>{u.inspirationCount}</b> 条灵感，且无法恢复。
        </p>
        {err && <div className={s.error}>{err}</div>}
        <div className={s.dlgActions}>
          <button onClick={onClose}>取消</button>
          <button className={s.dangerBtn} disabled={busy} onClick={() => run(() => adminApi.deleteUser(u.id))}>确认删除</button>
        </div>
      </Shell>
    )
  }

  const isSelf = editing?.id === selfId
  const submit = () => run(() => editing
    ? adminApi.updateUser(editing.id, {
        displayName: displayName.trim(),
        ...(isSelf ? {} : { role, status }),
        ...(password ? { resetPassword: password } : {}),
      })
    : adminApi.createUser({ username: username.trim(), displayName: displayName.trim(), password, role }))

  return (
    <Shell title={editing ? `编辑 · ${editing.username}` : '新增账号'} onClose={onClose}>
      {!editing && (
        <label className={s.f}><span>用户名</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3-20 位字母、数字、_ -" autoFocus />
        </label>
      )}
      <label className={s.f}><span>昵称</span>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label className={s.f}><span>{editing ? '重置密码（留空则不修改）' : '初始密码'}</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 位" autoComplete="new-password" />
      </label>
      {!isSelf && (
        <div className={s.two}>
          <label className={s.f}><span>角色</span>
            <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'user')}>
              <option value="user">用户</option><option value="admin">管理员</option>
            </select>
          </label>
          {editing && (
            <label className={s.f}><span>状态</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'disabled')}>
                <option value="active">启用</option><option value="disabled">停用</option>
              </select>
            </label>
          )}
        </div>
      )}
      {isSelf && <p className={s.note}>不能在这里修改自己的角色和状态。</p>}
      {err && <div className={s.error}>{err}</div>}
      <div className={s.dlgActions}>
        <button onClick={onClose}>取消</button>
        <button className={s.primary} disabled={busy || !displayName.trim() || (!editing && (!username || !password))} onClick={submit}>
          {editing ? '保存' : '创建'}
        </button>
      </div>
    </Shell>
  )
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={s.dlgTitle}>{title}</div>
        {children}
      </div>
    </div>
  )
}
