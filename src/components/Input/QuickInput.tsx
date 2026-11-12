import { useState } from 'react'
import { useEntryStore } from '../../store/entryStore'
import { useUIStore } from '../../store/uiStore'
import { parseInput } from '../../utils/parseInput'
import { describeConflict } from '../../utils/conflict'
import s from './QuickInput.module.css'

export function QuickInput() {
  const [value, setValue] = useState('')
  const [warn, setWarn] = useState('')
  const { addEntry } = useEntryStore()
  const { currentDate } = useUIStore()

  const submit = () => {
    const v = value.trim()
    if (!v) return
    const parsed = parseInput(v, currentDate)
    const result = addEntry({
      startTime: parsed.startTime ?? new Date().toISOString(),
      endTime: parsed.endTime,
      title: parsed.title,
      memo: parsed.memo,
      categoryId: parsed.categoryId ?? 'other',
    })
    if (!result.ok) {
      setWarn(
        result.kind === 'conflict'
          ? `时间冲突：已有 ${describeConflict(result.conflict)}`
          : result.message
      )
      return
    }
    setWarn('')
    setValue('')
  }

  return (
    <>
      <div className={s.wrapWrap}>
        <div className={s.wrap}>
          <svg className={s.icon} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="7" cy="7" r="5.5"/>
            <line x1="7" y1="4.5" x2="7" y2="7"/>
            <line x1="7" y1="7" x2="9" y2="8.2"/>
          </svg>
          <input
            className={s.input}
            value={value}
            onChange={(e) => { setValue(e.target.value); setWarn('') }}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="记一笔：14:00-15:30 改论文 · 备忘 · #科研"
            aria-label="快速录入时间记录"
          />
          {value && (
            <button
              className={s.clear}
              onClick={() => { setValue(''); setWarn('') }}
              aria-label="清空"
              tabIndex={-1}
            >
              <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="2" y1="2" x2="8" y2="8"/>
                <line x1="8" y1="2" x2="2" y2="8"/>
              </svg>
            </button>
          )}
        </div>
        {warn && <div className={s.warn}>{warn}</div>}
      </div>
      <button className={s.btn} onClick={submit}>记下</button>
    </>
  )
}
