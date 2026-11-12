import { useMemo, useRef, useEffect, useState } from 'react'
import {
  startOfWeek, endOfWeek, eachDayOfInterval,
  format, isToday, parseISO,
  differenceInMinutes, startOfDay
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useEntryStore } from '../../store/entryStore'
import { useUIStore } from '../../store/uiStore'
import { formatDuration } from '../../utils/parseInput'
import { segmentForDay } from '../../utils/entrySegments'
import { EntryModal } from './EntryModal'
import { NewEntryModal } from './NewEntryModal'
import s from './WeekView.module.css'

const HOUR_HEIGHT = 60
const HOURS = Array.from({ length: 25 }, (_, i) => i)


export function WeekView() {
  const { entries } = useEntryStore()
  const { categories } = useEntryStore()
  const {
    currentDate, filterCategoryId,
    navigate, setCurrentDate,
    setEditingEntry, editingEntryId,
  } = useUIStore()

  const scrollRef = useRef<HTMLDivElement>(null)
  const [newEntry, setNewEntry] = useState<{ date: string; hour: number } | null>(null)

  // Always anchor to Monday of the week containing currentDate
  const weekStart = useMemo(
    () => startOfWeek(parseISO(currentDate + 'T12:00:00'), { weekStartsOn: 1 }),
    [currentDate]
  )
  const weekEnd = useMemo(
    () => endOfWeek(weekStart, { weekStartsOn: 1 }),
    [weekStart]
  )
  const days = useMemo(
    () => eachDayOfInterval({ start: weekStart, end: weekEnd }),
    [weekStart, weekEnd]
  )

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_HEIGHT - 20
    }
  }, [])

  const catMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories]
  )

  const weekEntries = useMemo(
    () => entries.filter((e) => {
      const d = parseISO(e.startTime)
      return d >= weekStart && d <= weekEnd
    }),
    [entries, weekStart, weekEnd]
  )

  const totalMins = useMemo(
    () => weekEntries.reduce((acc, e) => {
      if (!e.endTime) return acc
      return acc + differenceInMinutes(parseISO(e.endTime), parseISO(e.startTime))
    }, 0),
    [weekEntries]
  )

  const recordedDays = useMemo(() => {
    const set = new Set(weekEntries.map((e) => format(parseISO(e.startTime), 'yyyy-MM-dd')))
    return set.size
  }, [weekEntries])

  const avgMins = recordedDays > 0 ? Math.round(totalMins / recordedDays) : 0

  const entriesForDay = (day: Date) =>
    entries.filter((e) => segmentForDay(e, day) !== null)

  const dayTotalMins = (day: Date) =>
    entriesForDay(day).reduce((acc, e) => {
      const seg = segmentForDay(e, day)
      return acc + (seg ? seg.durationMinutes : 0)
    }, 0)

  const handleBodyClick = (e: React.MouseEvent<HTMLDivElement>, day: Date) => {
    // Only fire on direct click on the body, not on a block
    if ((e.target as HTMLElement).closest('[data-block]')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const hour = Math.floor(y / HOUR_HEIGHT)
    setNewEntry({ date: format(day, 'yyyy-MM-dd'), hour: Math.max(0, Math.min(23, hour)) })
  }

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const todayStart = startOfDay(now)
  const nowY = (differenceInMinutes(now, todayStart) / 60) * HOUR_HEIGHT

  const goToday = () => setCurrentDate(format(new Date(), 'yyyy-MM-dd'))

  return (
    <div className={s.container}>
      {/* Stats bar */}
      <div className={s.stats}>
        <div className={s.statCard}>
          <div className={s.statLabel}>本周记录</div>
          <div className={s.statValue}>
            {weekEntries.length}<span className={s.statUnit}> 条</span>
          </div>
        </div>
        <div className={s.statCard}>
          <div className={s.statLabel}>合计时长</div>
          <div className={s.statValue}>
            {Math.floor(totalMins / 60)}
            <span className={s.statUnit}>小时</span>
            {totalMins % 60 > 0 && <>{totalMins % 60}<span className={s.statUnit}>分</span></>}
          </div>
        </div>
        <div className={s.statCard}>
          <div className={s.statLabel}>有记录天数</div>
          <div className={s.statValue}>
            {recordedDays}<span className={s.statUnit}> / 7</span>
          </div>
        </div>
        <div className={s.statCard}>
          <div className={s.statLabel}>日均</div>
          <div className={s.statValue}>
            {Math.floor(avgMins / 60)}
            <span className={s.statUnit}>h</span>
            {avgMins % 60 > 0 && <>{avgMins % 60}<span className={s.statUnit}>m</span></>}
          </div>
        </div>
      </div>

      {/* Nav row */}
      <div className={s.navRow}>
        <button className={s.navBtn} onClick={() => navigate(-1, 'week')} aria-label="上周">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M9 2L4 7l5 5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button className={s.navBtn} onClick={() => navigate(1, 'week')} aria-label="下周">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M5 2l5 5-5 5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className={s.navTitle}>
          {format(weekStart, 'yyyy年 M月 d日', { locale: zhCN })}
          {' — '}
          {format(weekEnd, 'M月 d日', { locale: zhCN })}
        </span>
        <button className={s.todayBtn} onClick={goToday}>今天</button>
      </div>

      {/* Grid */}
      <div className={s.gridWrap} ref={scrollRef}>
        <div className={s.grid}>
          {/* Time axis */}
          <div className={s.timeAxis}>
            <div className={s.timeAxisPad} />
            {HOURS.map((h) => (
              <div key={h} className={s.timeLabel}>
                {h < 24 ? String(h).padStart(2, '0') : ''}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, di) => {
            const dayEntries = entriesForDay(day)
            const isToday_ = isToday(day)

            return (
              <div key={di} className={s.dayCol}>
                {/* Header */}
                <div className={`${s.dayHeader} ${isToday_ ? s.todayHeader : ''}`}>
                  <div className={s.dayWeekName}>
                    {'一二三四五六日'[di]}
                  </div>
                  <div className={`${s.dayNum} ${isToday_ ? s.todayNum : ''}`}>
                    {format(day, 'd')}
                  </div>
                  <div className={s.dayTotal}>
                    {dayTotalMins(day) > 0 ? formatDuration(dayTotalMins(day)) : ''}
                  </div>
                </div>

                {/* Body */}
                <div
                  className={s.dayBody}
                  style={{ height: HOURS.length * HOUR_HEIGHT }}
                  onClick={(e) => handleBodyClick(e, day)}
                >
                  {/* Grid lines */}
                  {HOURS.map((h) => (
                    <div key={h} className={s.hourLine} style={{ top: h * HOUR_HEIGHT }} />
                  ))}
                  {HOURS.slice(0, -1).map((h) => (
                    <div key={h} className={s.halfLine} style={{ top: h * HOUR_HEIGHT + 30 }} />
                  ))}

                  {/* Now indicator */}
                  {isToday_ && (
                    <div className={s.nowLine} style={{ top: nowY }}>
                      <div className={s.nowDot} />
                    </div>
                  )}

                  {/* Entries */}
                  {dayEntries.map((entry) => {
                    const seg = segmentForDay(entry, day)
                    if (!seg) return null
                    const cat = catMap[entry.categoryId]
                    const top = (seg.offsetMinutes / 60) * HOUR_HEIGHT
                    const height = Math.max(18, (seg.durationMinutes / 60) * HOUR_HEIGHT - 2)
                    const dimmed = filterCategoryId && entry.categoryId !== filterCategoryId
                    const isPast = isToday_ && !!entry.endTime && parseISO(entry.endTime) < now

                    return (
                      <div
                        key={entry.id}
                        data-block="1"
                        className={`${s.block} ${dimmed ? s.dimmed : ''} ${isPast ? s.past : ''} ${seg.isContinuation ? s.continued : ''} ${seg.continuesAfter ? s.continues : ''}`}
                        style={{
                          top,
                          height,
                          background: cat?.color ?? 'var(--cat-other)',
                        }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingEntry(entry.id)
                        }}
                      >
                        <div className={s.blockTitle}>
                          {seg.isContinuation && <span className={s.crossTag}>续</span>}
                          {entry.title}
                          {seg.continuesAfter && <span className={s.crossTag}>→</span>}
                        </div>
                        {height > 34 && (
                          <div className={s.blockTime}>
                            {seg.isContinuation ? '00:00' : format(parseISO(entry.startTime), 'HH:mm')}
                            –
                            {seg.continuesAfter ? '24:00' : format(parseISO(entry.endTime!), 'HH:mm')}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
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
          onClose={() => setNewEntry(null)}
        />
      )}
    </div>
  )
}
