import { useMemo, useRef, useEffect, useState } from 'react'
import {
  format, isToday, parseISO,
  differenceInMinutes, startOfDay
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useEntryStore } from '../../store/entryStore'
import { useUIStore } from '../../store/uiStore'
import { segmentForDay } from '../../utils/entrySegments'
import { EntryModal } from './EntryModal'
import { NewEntryModal } from './NewEntryModal'
import s from './DayView.module.css'

const HOUR_HEIGHT = 64
const HOURS = Array.from({ length: 25 }, (_, i) => i)
const MINUTE_SNAP = 15

export function DayView() {
  const { entries } = useEntryStore()
  const { categories } = useEntryStore()
  const { currentDate, filterCategoryId, navigate, setCurrentDate, setEditingEntry, editingEntryId } = useUIStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [newEntry, setNewEntry] = useState<{ date: string; hour: number; minute: number } | null>(null)

  /** Click an empty spot to start a record there, snapped to 15-minute steps. */
  const handleColumnClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[class*="block"]')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const minutes = ((e.clientY - rect.top) / HOUR_HEIGHT) * 60
    const snapped = Math.round(minutes / MINUTE_SNAP) * MINUTE_SNAP
    const clamped = Math.max(0, Math.min(23 * 60 + 45, snapped))
    setNewEntry({
      date: currentDate,
      hour: Math.floor(clamped / 60),
      minute: clamped % 60,
    })
  }

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT - 20
  }, [])

  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories])
  const day = useMemo(() => parseISO(currentDate), [currentDate])
  const dayStart = startOfDay(day)

  const dayEntries = useMemo(
    () => entries.filter((e) => segmentForDay(e, day) !== null),
    [entries, day]
  )

  const totalMins = useMemo(
    () => dayEntries.reduce((acc, e) => {
      const seg = segmentForDay(e, day)
      return acc + (seg ? seg.durationMinutes : 0)
    }, 0),
    [dayEntries, day]
  )

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const nowY = isToday(day)
    ? (differenceInMinutes(now, dayStart) / 60) * HOUR_HEIGHT
    : null

  return (
    <div className={s.container}>
      {/* Stats */}
      <div className={s.stats}>
        <div className={s.statCard}>
          <div className={s.statLabel}>今日记录</div>
          <div className={s.statValue}>{dayEntries.length}<span className={s.statUnit}> 条</span></div>
        </div>
        <div className={s.statCard}>
          <div className={s.statLabel}>合计时长</div>
          <div className={s.statValue}>
            {Math.floor(totalMins / 60)}
            <span className={s.statUnit}>h</span>
            {totalMins % 60 > 0 && <>{totalMins % 60}<span className={s.statUnit}>m</span></>}
          </div>
        </div>
      </div>

      {/* Nav */}
      <div className={s.navRow}>
        <button className={s.navBtn} onClick={() => navigate(-1, 'day')}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M9 2L4 7l5 5" />
          </svg>
        </button>
        <button className={s.navBtn} onClick={() => navigate(1, 'day')}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M5 2l5 5-5 5" />
          </svg>
        </button>
        <span className={s.navTitle}>
          {format(day, 'yyyy年 M月 d日 EEEE', { locale: zhCN })}
        </span>
        {!isToday(day) && (
          <button className={s.todayBtn} onClick={() => setCurrentDate(format(new Date(), 'yyyy-MM-dd'))}>今天</button>
        )}
      </div>

      {/* Timeline */}
      <div className={s.timeline} ref={scrollRef}>
        <div className={s.timeAxis}>
          {HOURS.map((h) => (
            <div key={h} className={s.timeLabel}>
              {h < 24 ? String(h).padStart(2, '0') : ''}
            </div>
          ))}
        </div>

        <div className={s.dayColumn} onClick={handleColumnClick}>
          {HOURS.map((h) => (
            <div key={h} className={s.hourLine} style={{ top: h * HOUR_HEIGHT }} />
          ))}
          {HOURS.slice(0, -1).map((h) => (
            <div key={h} className={s.halfLine} style={{ top: h * HOUR_HEIGHT + 32 }} />
          ))}
          {nowY !== null && (
            <div className={s.nowLine} style={{ top: nowY }}>
              <div className={s.nowDot} />
            </div>
          )}
          {dayEntries.map((entry) => {
            const seg = segmentForDay(entry, day)
            if (!seg) return null
            const cat = catMap[entry.categoryId]
            const top = (seg.offsetMinutes / 60) * HOUR_HEIGHT
            const height = Math.max(20, (seg.durationMinutes / 60) * HOUR_HEIGHT - 2)
            const dimmed = filterCategoryId && entry.categoryId !== filterCategoryId
            const isPast = isToday(day) && !!entry.endTime && parseISO(entry.endTime) < now
            return (
              <div
                key={entry.id}
                className={`${s.block} ${dimmed ? s.dimmed : ''} ${isPast ? s.past : ''} ${seg.isContinuation ? s.continued : ''} ${seg.continuesAfter ? s.continues : ''}`}
                style={{ top, height, background: cat?.color ?? 'var(--cat-other)' }}
                onClick={() => setEditingEntry(entry.id)}
              >
                <div className={s.blockTitle}>
                  {seg.isContinuation && <span className={s.crossTag}>续</span>}
                  {entry.title}
                  {seg.continuesAfter && <span className={s.crossTag}>→</span>}
                </div>
                {height > 36 && (
                  <div className={s.blockTime}>
                    {seg.isContinuation ? '00:00' : format(parseISO(entry.startTime), 'HH:mm')}
                    –
                    {seg.continuesAfter ? '24:00' : format(parseISO(entry.endTime!), 'HH:mm')}
                  </div>
                )}
                {height > 56 && entry.memo && (
                  <div className={s.blockMemo}>{entry.memo}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {editingEntryId && <EntryModal entryId={editingEntryId} />}
      {newEntry && (
        <NewEntryModal
          date={newEntry.date}
          startHour={newEntry.hour}
          startMinute={newEntry.minute}
          onClose={() => setNewEntry(null)}
        />
      )}
    </div>
  )
}
