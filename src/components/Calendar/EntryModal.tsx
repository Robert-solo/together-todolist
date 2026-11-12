import { useState } from 'react'
import { format, parseISO, addDays } from 'date-fns'
import { useEntryStore } from '../../store/entryStore'
import { useUIStore } from '../../store/uiStore'
import { describeConflict } from '../../utils/conflict'
import { normalizeClockTime } from '../../utils/parseInput'
import { isCrossDay } from '../../utils/entrySegments'
import s from './EntryModal.module.css'

interface Props { entryId: string }

export function EntryModal({ entryId }: Props) {
  const { entries, categories, updateEntry, deleteEntry } = useEntryStore()
  const { setEditingEntry } = useUIStore()
  const [warn, setWarn] = useState('')

  const entry = entries.find((e) => e.id === entryId)
  if (!entry) return null

  const fmtTime = (iso: string) => format(parseISO(iso), 'HH:mm')

  const [title, setTitle] = useState(entry.title)
  const [memo, setMemo] = useState(entry.memo)
  const [categoryId, setCategoryId] = useState(entry.categoryId)
  const [startTime, setStartTime] = useState(fmtTime(entry.startTime))
  const [endTime, setEndTime] = useState(entry.endTime ? fmtTime(entry.endTime) : '')
  const [crossDay, setCrossDay] = useState(() => entry.endTime ? isCrossDay(entry) : false)

  const dateStr = entry.startTime.slice(0, 10)
  const endDate = crossDay ? format(addDays(parseISO(dateStr), 1), 'yyyy-MM-dd') : dateStr

  const save = () => {
    const startHM = normalizeClockTime(startTime)
    if (!startHM) {
      setWarn(`开始时间「${startTime}」无法识别，请写成 09:00 这样`)
      return
    }
    const endHM = endTime ? normalizeClockTime(endTime) : null
    if (endTime && !endHM) {
      setWarn(`结束时间「${endTime}」无法识别，请写成 10:30 这样`)
      return
    }

    const result = updateEntry(entryId, {
      title: title.trim() || entry.title,
      memo,
      categoryId,
      startTime: `${dateStr}T${startHM}:00`,
      endTime: endHM ? `${endDate}T${endHM}:00` : null,
    })
    if (!result.ok) {
      setWarn(
        result.kind === 'conflict'
          ? `时间冲突：已有 ${describeConflict(result.conflict)}`
          : result.message
      )
      return
    }
    setEditingEntry(null)
  }

  const remove = () => {
    deleteEntry(entryId)
    setEditingEntry(null)
  }

  const cat = categories.find((c) => c.id === categoryId)

  return (
    <div className={s.overlay} onClick={() => setEditingEntry(null)}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.header}>
          <div className={s.catBadge}>
            {cat && <span className={s.catDot} style={{ background: cat.color }} />}
            {cat?.name ?? '未分类'}
          </div>
          <div className={s.headerActions}>
            <button className={s.deleteBtn} onClick={remove}>删除</button>
            <button className={s.close} onClick={() => setEditingEntry(null)}>✕</button>
          </div>
        </div>

        <div className={s.body}>
          {warn && <div className={s.warn}>{warn}</div>}
          <div className={s.field}>
            <span className={s.label}>活动名称</span>
            <input
              className={s.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className={s.field}>
            <span className={s.label}>
              时间段
              <span className={s.dateHint}>{format(parseISO(dateStr), 'M月d日')}</span>
            </span>
            <div className={s.timeRow}>
              <input
                className={s.input}
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                placeholder="09:00"
              />
              <span className={s.timeSep}>→</span>
              <input
                className={s.input}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                placeholder="10:00"
              />
            </div>
            <label className={s.crossDayRow}>
              <input
                type="checkbox"
                checked={crossDay}
                onChange={(e) => setCrossDay(e.target.checked)}
              />
              <span>
                次日结束
                <span className={s.dateHint}>
                  {crossDay ? `→ ${format(parseISO(endDate), 'M月d日')}` : ''}
                </span>
              </span>
            </label>
          </div>

          <div className={s.field}>
            <span className={s.label}>分类</span>
            <div className={s.catSelect}>
              {categories.map((c) => (
                <button
                  key={c.id}
                  className={`${s.catOption} ${c.id === categoryId ? s.selected : ''}`}
                  style={c.id === categoryId ? { background: c.color } : {}}
                  onClick={() => setCategoryId(c.id)}
                >
                  <span className={s.catOptionDot} style={{ background: c.color }} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className={s.field}>
            <span className={s.label}>备忘</span>
            <input
              className={s.input}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="添加备忘内容…"
            />
          </div>
        </div>

        <div className={s.footer}>
          <button className={s.cancelBtn} onClick={() => setEditingEntry(null)}>取消</button>
          <button className={s.saveBtn} onClick={save}>保存</button>
        </div>
      </div>
    </div>
  )
}
