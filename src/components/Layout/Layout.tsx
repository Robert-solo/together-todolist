import { useNavigate, useLocation } from 'react-router-dom'
import { useUIStore } from '../../store/uiStore'
import { useEntryStore } from '../../store/entryStore'
import { useAuthStore } from '../../store/authStore'
import { Avatar } from '../Profile/Avatar'
import { QuickInput } from '../Input/QuickInput'
import { InspirationBox } from '../InspirationBox/InspirationBox'
import { CategoryManager } from '../Category/CategoryManager'
import s from './Layout.module.css'

const NAV_ITEMS = [
  { path: '/day',   label: '日',  icon: 'day'   },
  { path: '/week',  label: '周',  icon: 'week'  },
  { path: '/month', label: '月',  icon: 'month' },
  { path: '/stats', label: '统计', icon: 'stats' },
]

function DayIcon() {
  return (
    <svg className={s.navIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="8" cy="9" r="5"/>
      <path d="M8 6v3l2 1.5"/>
      <line x1="5" y1="2" x2="5" y2="4"/>
      <line x1="11" y1="2" x2="11" y2="4"/>
    </svg>
  )
}
function WeekIcon() {
  return (
    <svg className={s.navIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="3" width="12" height="11" rx="2"/>
      <line x1="2" y1="7" x2="14" y2="7"/>
      <line x1="5.5" y1="2" x2="5.5" y2="4.5"/>
      <line x1="10.5" y1="2" x2="10.5" y2="4.5"/>
      <line x1="5" y1="10" x2="11" y2="10"/>
      <line x1="5" y1="12.5" x2="8.5" y2="12.5"/>
    </svg>
  )
}
function MonthIcon() {
  return (
    <svg className={s.navIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="3" width="12" height="11" rx="2"/>
      <line x1="2" y1="7" x2="14" y2="7"/>
      <line x1="5.5" y1="2" x2="5.5" y2="4.5"/>
      <line x1="10.5" y1="2" x2="10.5" y2="4.5"/>
      <circle cx="5.5" cy="10" r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="8" cy="10" r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="10.5" cy="10" r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="5.5" cy="12.5" r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="8" cy="12.5" r="0.8" fill="currentColor" stroke="none"/>
    </svg>
  )
}
function StatsIcon() {
  return (
    <svg className={s.navIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
      <line x1="2" y1="14" x2="14" y2="14"/>
      <rect x="3" y="9" width="2.5" height="5" rx="0.5" fill="currentColor" stroke="none" opacity="0.4"/>
      <rect x="6.75" y="5.5" width="2.5" height="8.5" rx="0.5" fill="currentColor" stroke="none" opacity="0.7"/>
      <rect x="10.5" y="2.5" width="2.5" height="11.5" rx="0.5" fill="currentColor" stroke="none"/>
    </svg>
  )
}

const ICONS: Record<string, React.FC> = {
  day: DayIcon, week: WeekIcon, month: MonthIcon, stats: StatsIcon,
}

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const {
    filterCategoryId, setFilter,
    setCategoryManager, categoryManagerOpen,
    toggleInspiration, inspirationOpen,
  } = useUIStore()
  const { categories, entries } = useEntryStore()
  const { user } = useAuthStore()

  const countForCat = (id: string) =>
    entries.filter((e) => e.categoryId === id).length

  const activeFilter = categories.find((c) => c.id === filterCategoryId)

  return (
    <div className={s.layout}>
      {/* Sidebar */}
      <aside className={s.sidebar}>
        {user && (
          <button
            className={`${s.profileCard} ${location.pathname === '/profile' ? s.profileActive : ''}`}
            onClick={() => navigate('/profile')}
          >
            <Avatar user={user} size={40} />
            <div className={s.userInfo}>
              <div className={s.userName}>{user.displayName}</div>
              <div className={s.userRole}>
                {user.role === 'admin' ? '管理员' : '用户'}
              </div>
            </div>
            <svg className={s.chev} width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M5 2l5 5-5 5" />
            </svg>
          </button>
        )}

        <nav className={s.nav}>
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.icon]
            const active = location.pathname === item.path
            return (
              <a
                key={item.path}
                className={`${s.navItem} ${active ? s.active : ''}`}
                onClick={() => navigate(item.path)}
              >
                <Icon />
                {item.label}
              </a>
            )
          })}
        </nav>

        <div className={s.catSection}>
          <div className={s.catDivider} />
          <div className={s.catHeader}>
            <span className={s.catLabel}>分类</span>
            <span className={s.catManage} onClick={() => setCategoryManager(true)}>管理</span>
          </div>
          <div className={s.catList}>
            {categories.map((cat) => (
              <div
                key={cat.id}
                className={`${s.catItem} ${filterCategoryId === cat.id ? s.catActive : ''}`}
                onClick={() =>
                  setFilter(filterCategoryId === cat.id ? null : cat.id)
                }
              >
                <span className={s.catDot} style={{ background: cat.color }} />
                <span className={s.catName}>{cat.name}</span>
                <span className={s.catCount}>{countForCat(cat.id)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={s.sidebarFooter}>
          <div className={s.sidebarFooterText}>
            手机访问<br />
            {typeof window !== 'undefined' ? window.location.host : ''}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className={s.main}>
        <header className={s.topbar}>
          <QuickInput />
          {activeFilter && (
            <div className={s.filterChip}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: activeFilter.color, display: 'inline-block', flexShrink: 0,
              }} />
              {activeFilter.name}
              <span className={s.filterChipClose} onClick={() => setFilter(null)}>✕</span>
            </div>
          )}
        </header>

        <div className={s.pageContent}>{children}</div>
      </div>

      {/* Bottom nav (mobile) */}
      <nav className={s.bottomNav}>
        <div className={s.bottomNavInner}>
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.icon]
            const active = location.pathname === item.path
            return (
              <a
                key={item.path}
                className={`${s.bottomNavItem} ${active ? s.active : ''}`}
                onClick={() => navigate(item.path)}
              >
                <Icon />
                {item.label}
              </a>
            )
          })}
        </div>
      </nav>

      {/* FAB */}
      <button className="fab" onClick={toggleInspiration} aria-label="灵感箱">
        🔮 灵感箱
      </button>

      {inspirationOpen && <InspirationBox />}
      {categoryManagerOpen && <CategoryManager />}
    </div>
  )
}
