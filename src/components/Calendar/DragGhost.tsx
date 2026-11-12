import type { CSSProperties } from 'react'
import { segmentForRange } from '../../utils/entrySegments'
import { fmtClock } from '../../utils/time'
import { LONG_PRESS_MS, type DragPreview, type PressState } from '../../hooks/useTimelineDrag'
import s from './Timeline.module.css'

interface GhostProps {
  preview: DragPreview
  day: Date
  hourHeight: number
}

/** 拖动 / 调整 / 新建时跟手的预览块；与其他日程冲突时变红。 */
export function DragGhost({ preview, day, hourHeight }: GhostProps) {
  const seg = segmentForRange(preview.start, preview.end, day)
  if (!seg) return null

  const top = (seg.offsetMinutes / 60) * hourHeight
  const height = Math.max(20, (seg.durationMinutes / 60) * hourHeight - 2)
  const cls = [
    s.ghost,
    preview.mode === 'create' ? s.ghostCreate : '',
    preview.valid ? '' : s.ghostInvalid,
  ].join(' ')

  return (
    <div
      className={cls}
      style={{ top, height, '--ghost': preview.color ?? 'var(--c-accent-1)' } as CSSProperties}
    >
      <div className={s.ghostTitle}>{preview.title ?? '新事件'}</div>
      {height > 30 && (
        <div className={s.ghostTime}>
          {preview.valid
            ? `${fmtClock(new Date(preview.start))}–${fmtClock(new Date(preview.end))}`
            : '与其他日程冲突'}
        </div>
      )}
    </div>
  )
}

/** 空白处按下后的圆形长按进度反馈。 */
export function PressRipple({ press, dateKey }: { press: PressState; dateKey: string }) {
  if (!press || press.kind !== 'empty' || press.dateKey !== dateKey) return null
  return (
    <div
      className={s.ripple}
      style={{ left: press.x, top: press.y, animationDuration: `${LONG_PRESS_MS}ms` }}
    />
  )
}
