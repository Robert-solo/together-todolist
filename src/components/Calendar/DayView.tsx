import { useMemo, useRef, useEffect, useState } from 'react'
import {
  format, isToday, parseISO,
  differenceInMinutes, startOfDay
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useEntryStore } from '../../store/entryStore'
import { useUIStore } from '../../store/uiStore'
import { segmentForDay } from '../../utils/entrySegments'
import { fmtClock } from '../../utils/time'
import { useTimelineDrag, type CreateRange } from '../../hooks/useTimelineDrag'
import { EntryModal } from './EntryModal'
import { NewEntryModal } from './NewEntryModal'
import { DragGhost, PressRipple } from './DragGhost'
import s from './DayView.module.css'
import t from './Timeline.module.css'

const HOUR_HEIGHT = 64
const HOURS = Array.from({ length: 25 }, (_, i) => i)

export function DayView() {
  const { entries } = useEntryStore()
  const { categories } = useEntryStore()
  const { currentDate, filterCategoryId, navigate, setCurrentDate, setEditingEntry, editingEntryId } = useUIStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [newEntry, setNewEntry] = useState<CreateRange | null>(null)

  /** 长按空白新建 / 长按事件拖动 / 按住边缘调整时长（见 useTimelineDrag）。 */
  const drag = useTimelineDrag({
    scrollRef,
    totalHours: HOURS.length,
    onTap: setEditingEntry,
    onCreate: setNewEntry,
  })

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
              {h < 24 ? h : ''}
            </div>
          ))}
        </div>

        <div className={s.dayColumn} {...drag.columnProps(currentDate)}>
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
            const color = cat?.color ?? 'var(--cat-other)'
            const lifted = drag.preview?.entryId === entry.id
            const pressing = drag.press?.kind === 'entry' && drag.press.entryId === entry.id
            return (
              <div
                key={entry.id}
                {...drag.entryProps(entry, seg, currentDate, color)}
                className={[
                  s.block,
                  dimmed ? s.dimmed : '',
                  isPast ? s.past : '',
                  seg.isContinuation ? s.continued : '',
                  seg.continuesAfter ? s.continues : '',
                  !seg.isContinuation ? t.hTop : '',
                  !seg.continuesAfter ? t.hBottom : '',
                  lifted ? t.lifted : '',
                  pressing ? t.pressing : '',
                ].join(' ')}
                style={{ top, height, background: color }}
              >
                <div className={s.blockTitle}>
                  {seg.isContinuation && <span className={s.crossTag}>续</span>}
                  {entry.title}
                  {seg.continuesAfter && <span className={s.crossTag}>→</span>}
                </div>
                {height > 36 && (
                  <div className={s.blockTime}>
                    {seg.isContinuation ? '0:00' : fmtClock(entry.startTime)}
                    –
                    {seg.continuesAfter ? '24:00' : fmtClock(entry.endTime!)}
                  </div>
                )}
                {height > 56 && entry.memo && (
                  <div className={s.blockMemo}>{entry.memo}</div>
                )}
              </div>
            )
          })}

          <PressRipple press={drag.press} dateKey={currentDate} />
          {drag.preview && <DragGhost preview={drag.preview} day={day} hourHeight={HOUR_HEIGHT} />}
        </div>
      </div>

      {editingEntryId && <EntryModal entryId={editingEntryId} />}
      {newEntry && (
        <NewEntryModal
          date={newEntry.date}
          startHour={Math.floor(newEntry.startMinutes / 60)}
          startMinute={newEntry.startMinutes % 60}
          endHour={Math.floor((newEntry.endMinutes >= 1440 ? newEntry.endMinutes - 1440 : newEntry.endMinutes) / 60)}
          endMinute={(newEntry.endMinutes >= 1440 ? newEntry.endMinutes - 1440 : newEntry.endMinutes) % 60}
          endsNextDay={newEntry.endMinutes >= 1440}
          onClose={() => setNewEntry(null)}
        />
      )}
      {drag.notice && <div className="toast">{drag.notice}</div>}
    </div>
  )
}
