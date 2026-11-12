import { useMemo, useState } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isToday,
  format, parseISO, isSameDay, differenceInMinutes
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useEntryStore } from '../../store/entryStore'
import { useUIStore } from '../../store/uiStore'
import { formatDuration } from '../../utils/parseInput'
import { fmtClock } from '../../utils/time'
import { DayDetailModal } from './DayDetailModal'
import s from './MonthView.module.css'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

export function MonthView() {
  const { entries } = useEntryStore()
  const { categories } = useEntryStore()
  const { currentDate, navigate, setCurrentDate } = useUIStore()
  const [detailDate, setDetailDate] = useState<string | null>(null)

  const month = useMemo(() => parseISO(currentDate), [currentDate])
  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    return eachDayOfInterval({ start, end })
  }, [month])

  const entriesForDay = (day: Date) =>
    entries.filter((e) => isSameDay(parseISO(e.startTime), day))

  const dayMins = (day: Date) =>
    entriesForDay(day).reduce((acc, e) => {
      if (!e.endTime) return acc
      return acc + differenceInMinutes(parseISO(e.endTime), parseISO(e.startTime))
    }, 0)

  const handleDayClick = (day: Date) => {
    setDetailDate(format(day, 'yyyy-MM-dd'))
  }

  return (
    <div className={s.container}>
      {/* Nav */}
      <div className={s.navRow}>
        <button className={s.navBtn} onClick={() => navigate(-1, 'month')} aria-label="上个月">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M9 2L4 7l5 5" />
          </svg>
        </button>
        <button className={s.navBtn} onClick={() => navigate(1, 'month')} aria-label="下个月">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M5 2l5 5-5 5" />
          </svg>
        </button>
        <span className={s.navTitle}>
          {format(month, 'yyyy年 M月', { locale: zhCN })}
        </span>
        <button className={s.todayBtn} onClick={() => setCurrentDate(format(new Date(), 'yyyy-MM-dd'))}>今天</button>
      </div>

      {/* Calendar */}
      <div className={s.grid}>
        {WEEKDAYS.map((d) => (
          <div key={d} className={s.weekdayHeader}>{d}</div>
        ))}
        {days.map((day, i) => {
          const dayEntries = entriesForDay(day)
          const mins = dayMins(day)
          const inMonth = isSameMonth(day, month)
          const today = isToday(day)
          const limit = inMonth ? 3 : 2
          const visible = dayEntries.slice(0, limit)
          const dayDurations = visible.map((e) =>
            e.endTime ? differenceInMinutes(parseISO(e.endTime), parseISO(e.startTime)) : 0
          )
          const maxDuration = Math.max(1, ...dayDurations)
          return (
            <div
              key={i}
              className={`${s.cell} ${!inMonth ? s.otherMonth : ''} ${today ? s.today : ''}`}
              onClick={() => handleDayClick(day)}
            >
              <span className={s.dayNum}>{format(day, 'd')}</span>
              <div className={s.bars}>
                {visible.map((e, ei) => {
                  const cat = catMap[e.categoryId]
                  const color = cat?.color ?? 'var(--cat-other)'
                  const isPast =
                    isToday(day) && e.endTime && parseISO(e.endTime) < new Date()
                  const pct = Math.round((dayDurations[ei] / maxDuration) * 100)
                  return (
                    <div
                      key={e.id}
                      className={`${s.bar} ${isPast ? s.barPast : ''}`}
                      title={`${fmtClock(e.startTime)}${e.endTime ? '–' + fmtClock(e.endTime) : ''} ${e.title}`}
                    >
                      <span className={s.barText}>
                        <span className={s.barTime}>{fmtClock(e.startTime)}</span>
                        {e.title}
                      </span>
                      <span className={s.barTrack}>
                        <span
                          className={s.barFill}
                          style={{ width: `${pct}%`, background: color }}
                        />
                      </span>
                    </div>
                  )
                })}
                {dayEntries.length > limit && (
                  <div className={s.moreText}>+{dayEntries.length - limit} 项</div>
                )}
              </div>
              {mins > 0 && (
                <div className={s.totalText}>{formatDuration(mins)}</div>
              )}
            </div>
          )
        })}
      </div>

      {detailDate && (
        <DayDetailModal date={detailDate} onClose={() => setDetailDate(null)} />
      )}
    </div>
  )
}
