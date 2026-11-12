import { parseISO } from 'date-fns'
import type { TimeEntry } from '../types'

export interface TimeSpan {
  startTime: string
  endTime: string | null
}

/** Two entries collide when their intervals strictly overlap. */
export function overlaps(a: TimeSpan, b: TimeSpan): boolean {
  if (!a.endTime || !b.endTime) return false
  const aStart = parseISO(a.startTime).getTime()
  const aEnd = parseISO(a.endTime).getTime()
  const bStart = parseISO(b.startTime).getTime()
  const bEnd = parseISO(b.endTime).getTime()
  return aStart < bEnd && bStart < aEnd
}

/** Returns the first existing entry that conflicts with `candidate`, or null. */
export function findConflict(
  entries: TimeEntry[],
  candidate: TimeSpan,
  excludeId?: string
): TimeEntry | null {
  for (const e of entries) {
    if (excludeId && e.id === excludeId) continue
    if (overlaps(candidate, e)) return e
  }
  return null
}

export function describeConflict(entry: TimeEntry): string {
  const start = entry.startTime.slice(11, 16)
  const end = entry.endTime ? entry.endTime.slice(11, 16) : ''
  return end ? `${start}–${end}「${entry.title}」` : `${start}「${entry.title}」`
}
