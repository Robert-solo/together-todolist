import { useState } from 'react'
import { format, parseISO, addDays } from 'date-fns'
import { useEntryStore } from '../../store/entryStore'
import { describeConflict } from '../../utils/conflict'
import { normalizeClockTime } from '../../utils/parseInput'
import s from './EntryModal.module.css'

interface Props {
  date: string        // YYYY-MM-DD
  startHour: number   // 0-23
  startMinute?: number
  onClose: () => void
}

export function NewEntryModal({ date, startHour, startMinute = 0, onClose }: Props) {
  const { addEntry, categories } = useEntryStore()
  const [warn, setWarn] = useState('')

  const pad = (n: number) => String(n).padStart(2, '0')
  const [title, setTitle] = useState('')
  const [memo, setMemo] = useState('')
  const [categoryId, setCategoryId] = useState('other')
  const [startTime, setStartTime] = useState(`${pad(startHour)}:${pad(startMinute)}`)
  const [endTime, setEndTime] = useState(`${pad(Math.min(startHour + 1, 23))}:${pad(startMinute)}`)
  const [crossDay, setCrossDay] = useState(false)

  const endDate = crossDay ? format(addDays(parseISO(date), 1), 'yyyy-MM-dd') : date

  const save = () => {
    if (!title.trim()) return

    const startHM = normalizeClockTime(startTime)
    if (!startHM) {
      setWarn(`开始时间「${startTime}」无法识别，请写成 09:00 这样`)
      return
    }
    const endHM = normalizeClockTime(endTime)
    if (!endHM) {
      setWarn(`结束时间「${endTime}」无法识别，请写成 10:30 这样`)
      return
    }

    const result = addEntry({
      startTime: `${date}T${startHM}:00`,
      endTime:   `${endDate}T${endHM}:00`,
      title: title.trim(),
      memo,
      categoryId,
    })
    if (!result.ok) {
      setWarn(
        result.kind === 'conflict'
          ? `时间冲突：已有 ${describeConflict(result.conflict)}`
          : result.message
      )
      return
    }
    onClose()
  }

  const cat = categories.find((c) => c.id === categoryId)

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.header}>
          <div className={s.catBadge}>
            {cat && <span className={s.catDot} style={{ background: cat.color }} />}
            新建记录 · {format(parseISO(date), 'M月d日')}
          </div>
          <div className={s.headerActions}>
            <button className={s.close} onClick={onClose}>✕</button>
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
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="在做什么…"
              autoFocus
            />
          </div>

          <div className={s.field}>
            <span className={s.label}>
              时间段
              <span className={s.dateHint}>{format(parseISO(date), 'M月d日')}</span>
            </span>
            <div className={s.timeRow}>
              <input className={s.input} value={startTime} onChange={(e) => setStartTime(e.target.value)} placeholder="17:08" />
              <span className={s.timeSep}>→</span>
              <input className={s.input} value={endTime} onChange={(e) => setEndTime(e.target.value)} placeholder="04:01" />
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
                  style={c.id === categoryId ? { background: c.color, borderColor: c.color } : {}}
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
          <button className={s.cancelBtn} onClick={onClose}>取消</button>
          <button className={s.saveBtn} onClick={save} disabled={!title.trim()}>记录</button>
        </div>
      </div>
    </div>
  )
}
