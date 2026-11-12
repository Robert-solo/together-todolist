import { useState } from 'react'
import { useEntryStore } from '../../store/entryStore'
import { useUIStore } from '../../store/uiStore'
import { nanoid } from '../../utils/nanoid'
import s from './CategoryManager.module.css'

const PRESET_COLORS = [
  '#0A72E8','#5856D6','#A03DD6','#248A3D',
  '#C25E00','#D70015','#D0316F','#00809A',
  '#2E88B8','#0C817B','#8E6E4B','#636366',
]

export function CategoryManager() {
  const { categories, addCategory, updateCategory, deleteCategory } = useEntryStore()
  const { setCategoryManager } = useUIStore()
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null)

  const handleAdd = () => {
    if (!newName.trim()) return
    addCategory({ id: nanoid(), name: newName.trim(), color: newColor })
    setNewName('')
  }

  return (
    <div className={s.overlay} onClick={() => setCategoryManager(false)}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.header}>
          <span className={s.title}>分类管理</span>
          <button className={s.close} onClick={() => setCategoryManager(false)}>✕</button>
        </div>

        {/* Add new */}
        <div className={s.addRow}>
          <div className={s.colorPicker}>
            {PRESET_COLORS.map((c) => (
              <span
                key={c}
                className={`${s.colorDot} ${c === newColor ? s.selected : ''}`}
                style={{ background: c }}
                onClick={() => setNewColor(c)}
              />
            ))}
          </div>
          <div className={s.addInputRow}>
            <input
              className={s.input}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="新分类名称"
            />
            <button className={s.addBtn} onClick={handleAdd}>添加</button>
          </div>
        </div>

        {/* List */}
        <div className={s.list}>
          {categories.map((cat) => (
            <div key={cat.id} className={s.item}>
              <span className={s.dot} style={{ background: cat.color }} />
              {editingId === cat.id ? (
                <input
                  className={s.inlineInput}
                  defaultValue={cat.name}
                  autoFocus
                  onBlur={(e) => {
                    updateCategory(cat.id, { name: e.target.value.trim() || cat.name })
                    setEditingId(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
              ) : (
                <span className={s.name} onClick={() => setEditingId(cat.id)}>
                  {cat.name}
                </span>
              )}
              <button
                className={s.del}
                onClick={() => deleteCategory(cat.id)}
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
