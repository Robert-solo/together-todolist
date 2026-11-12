import { useState } from 'react'
import { useEntryStore } from '../../store/entryStore'
import { useUIStore } from '../../store/uiStore'
import s from './InspirationBox.module.css'

export function InspirationBox() {
  const { inspirations, addInspiration, deleteInspiration } = useEntryStore()
  const { toggleInspiration } = useUIStore()
  const [text, setText] = useState('')

  const submit = () => {
    if (!text.trim()) return
    addInspiration(text.trim())
    setText('')
  }

  return (
    <div className={s.overlay} onClick={toggleInspiration}>
      <div className={s.drawer} onClick={(e) => e.stopPropagation()}>
        <div className={s.header}>
          <span className={s.title}>🔮 灵感箱</span>
          <button className={s.close} onClick={toggleInspiration}>✕</button>
        </div>
        <div className={s.inputRow}>
          <input
            className={s.input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="记录一个想法…"
            autoFocus
          />
          <button className={s.addBtn} onClick={submit}>记录</button>
        </div>
        <div className={s.list}>
          {inspirations.length === 0 && (
            <div className={s.empty}>还没有灵感，快来记录第一条吧</div>
          )}
          {inspirations.map((ins) => (
            <div key={ins.id} className={s.item}>
              <span className={s.itemContent}>{ins.content}</span>
              <span className={s.itemTime}>
                {new Date(ins.createdAt).toLocaleDateString('zh-CN', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <button
                className={s.del}
                onClick={() => deleteInspiration(ins.id)}
                aria-label="删除"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
