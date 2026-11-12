import { useNavigate } from 'react-router-dom'
import { format, parseISO, differenceInMinutes } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import { useEntryStore } from '../../store/entryStore'
import { useUIStore } from '../../store/uiStore'
import { formatDuration } from '../../utils/parseInput'
import { fmtClock } from '../../utils/time'
import { EntryModal } from './EntryModal'
import s from './DayDetailModal.module.css'

interface Props {
  date: string  // YYYY-MM-DD
  onClose: () => void
}

export function DayDetailModal({ date, onClose }: Props) {
  const { entries, categories } = useEntryStore()
  const { setCurrentDate, editingEntryId, setEditingEntry } = useUIStore()
  const navigate = useNavigate()

  const dayEntries = entries
    .filter((e) => e.startTime.startsWith(date))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))

  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))

  const totalMins = dayEntries.reduce((acc, e) => {
    if (!e.endTime) return acc
    return acc + differenceInMinutes(parseISO(e.endTime), parseISO(e.startTime))
  }, 0)

  const handleViewDay = () => {
    setCurrentDate(date)
    navigate('/day')
    onClose()
  }

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.header}>
          <div className={s.dateTitle}>
            {format(parseISO(date), 'M月d日 EEEE', { locale: zhCN })}
          </div>
          <button className={s.close} onClick={onClose}>✕</button>
        </div>

        <div className={s.body}>
          {dayEntries.length === 0 ? (
            <div className={s.empty}>这天没有记录</div>
          ) : (
            <>
              <div className={s.summary}>
                共 {dayEntries.length} 项 · {formatDuration(totalMins)}
              </div>
              <div className={s.list}>
                {dayEntries.map((e) => {
                  const cat = catMap[e.categoryId]
                  const dur = e.endTime
                    ? differenceInMinutes(parseISO(e.endTime), parseISO(e.startTime))
                    : 0
                  return (
                    <div
                      key={e.id}
                      className={s.item}
                      onClick={() => setEditingEntry(e.id)}
                    >
                      <div className={s.itemTime}>
                        {fmtClock(e.startTime)}
                        {e.endTime && ` – ${fmtClock(e.endTime)}`}
                      </div>
                      <div className={s.itemContent}>
                        <div className={s.itemTitle}>{e.title}</div>
                        {e.memo && <div className={s.itemMemo}>{e.memo}</div>}
                      </div>
                      <div
                        className={s.itemCat}
                        style={{
                          background: cat?.color ?? 'var(--cat-other)',
                          color: 'white',
                        }}
                      >
                        {cat?.name ?? '其他'}
                      </div>
                      {dur > 0 && <div className={s.itemDur}>{formatDuration(dur)}</div>}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className={s.footer}>
          <button className={s.viewDayBtn} onClick={handleViewDay}>
            查看完整日视图
          </button>
        </div>
      </div>

      {editingEntryId && <EntryModal entryId={editingEntryId} />}
    </div>
  )
}
