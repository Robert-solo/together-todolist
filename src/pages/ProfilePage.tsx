import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO, differenceInMinutes } from 'date-fns'
import { useAuthStore } from '../store/authStore'
import { useEntryStore } from '../store/entryStore'
import { formatDuration } from '../utils/parseInput'
import { Avatar } from '../components/Profile/Avatar'
import { AvatarCropper } from '../components/Profile/AvatarCropper'
import s from './ProfilePage.module.css'

type Msg = { kind: 'ok' | 'err'; text: string } | null

export function ProfilePage() {
  const navigate = useNavigate()
  const { user, updateProfile, uploadAvatar, changePassword, logout } = useAuthStore()
  const { entries, categories, inspirations } = useEntryStore()

  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [profileMsg, setProfileMsg] = useState<Msg>(null)

  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [pwdMsg, setPwdMsg] = useState<Msg>(null)

  const [cropFile, setCropFile] = useState<File | null>(null)
  const [avatarMsg, setAvatarMsg] = useState<Msg>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const totalMins = useMemo(
    () => entries.reduce((a, e) => a + (e.endTime ? differenceInMinutes(parseISO(e.endTime), parseISO(e.startTime)) : 0), 0),
    [entries]
  )

  if (!user) return null

  const pickFile = (f?: File) => {
    if (!f) return
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
      setAvatarMsg({ kind: 'err', text: '请选择 PNG / JPG / WebP 图片' })
      return
    }
    if (f.size > 8 * 1024 * 1024) {
      setAvatarMsg({ kind: 'err', text: '图片不能超过 8MB' })
      return
    }
    setAvatarMsg(null)
    setCropFile(f)
  }

  const onCropped = async (dataUrl: string) => {
    setCropFile(null)
    const r = await uploadAvatar(dataUrl)
    setAvatarMsg(r.ok ? { kind: 'ok', text: '头像已更新' } : { kind: 'err', text: r.error ?? '上传失败' })
  }

  const saveProfile = async () => {
    try {
      await updateProfile({ displayName: displayName.trim(), email: email.trim(), bio })
      setProfileMsg({ kind: 'ok', text: '已保存' })
    } catch (e) {
      setProfileMsg({ kind: 'err', text: (e as Error).message })
    }
  }

  const savePassword = async () => {
    if (next !== again) return setPwdMsg({ kind: 'err', text: '两次输入的新密码不一致' })
    const r = await changePassword(cur, next)
    if (r.ok) {
      setCur(''); setNext(''); setAgain('')
      setPwdMsg({ kind: 'ok', text: '密码已修改，其他设备已退出登录' })
    } else setPwdMsg({ kind: 'err', text: r.error ?? '修改失败' })
  }

  const doLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const dirty = displayName !== user.displayName || email !== user.email || bio !== user.bio

  return (
    <div className={s.page}>
      <div className={s.inner}>
        <section className={s.hero}>
          <div className={s.avatarWrap}>
            <Avatar user={user} size={88} />
            <button className={s.camera} onClick={() => fileRef.current?.click()} aria-label="更换头像">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M2 5.5h2.2l1-1.8h5.6l1 1.8H14V13H2z" /><circle cx="8" cy="8.8" r="2.3" />
              </svg>
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden
              onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          <div className={s.heroText}>
            <div className={s.name}>{user.displayName}</div>
            <div className={s.sub}>
              <span className={`${s.badge} ${user.role === 'admin' ? s.badgeAdmin : ''}`}>
                {user.role === 'admin' ? '管理员' : '用户'}
              </span>
              @{user.username} · 加入于 {format(parseISO(user.createdAt), 'yyyy-MM-dd')}
            </div>
            {user.bio && <div className={s.bio}>{user.bio}</div>}
            <div className={s.avatarActions}>
              <button className={s.link} onClick={() => fileRef.current?.click()}>上传头像</button>
              {user.avatar && (
                <button className={s.link} onClick={async () => { await updateProfile({ avatar: '' }); setAvatarMsg({ kind: 'ok', text: '已移除头像' }) }}>
                  移除头像
                </button>
              )}
              {avatarMsg && <span className={avatarMsg.kind === 'ok' ? s.ok : s.err}>{avatarMsg.text}</span>}
            </div>
          </div>
        </section>

        <section className={s.card}>
          <h2 className={s.h2}>我的数据</h2>
          <div className={s.stats}>
            <div><b>{entries.length}</b><span>记录</span></div>
            <div><b>{categories.length}</b><span>分类</span></div>
            <div><b>{inspirations.length}</b><span>灵感</span></div>
            <div><b>{formatDuration(totalMins)}</b><span>累计时长</span></div>
          </div>
        </section>

        <section className={s.card}>
          <h2 className={s.h2}>基本资料</h2>
          <label className={s.field}><span>昵称</span>
            <input value={displayName} maxLength={30} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className={s.field}><span>邮箱</span>
            <input value={email} placeholder="选填" onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className={s.field}><span>个人简介</span>
            <textarea value={bio} maxLength={200} rows={3} placeholder="介绍一下自己（最多 200 字）" onChange={(e) => setBio(e.target.value)} />
          </label>
          <div className={s.row}>
            {profileMsg && <span className={profileMsg.kind === 'ok' ? s.ok : s.err}>{profileMsg.text}</span>}
            <button className={s.primary} onClick={saveProfile} disabled={!dirty || !displayName.trim()}>保存修改</button>
          </div>
        </section>

        <section className={s.card}>
          <h2 className={s.h2}>账号安全</h2>
          <label className={s.field}><span>当前密码</span>
            <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
          </label>
          <label className={s.field}><span>新密码</span>
            <input type="password" value={next} placeholder="至少 8 位" onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </label>
          <label className={s.field}><span>确认新密码</span>
            <input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
          </label>
          <div className={s.row}>
            {pwdMsg && <span className={pwdMsg.kind === 'ok' ? s.ok : s.err}>{pwdMsg.text}</span>}
            <button className={s.primary} onClick={savePassword} disabled={!cur || !next || !again}>修改密码</button>
          </div>
        </section>

        <div className={s.footerRow}>
          {user.role === 'admin' && (
            <button className={s.secondary} onClick={() => navigate('/admin/users')}>账号管理</button>
          )}
          <button className={s.danger} onClick={doLogout}>退出登录</button>
        </div>
      </div>

      {cropFile && <AvatarCropper file={cropFile} onCancel={() => setCropFile(null)} onDone={onCropped} />}
    </div>
  )
}
