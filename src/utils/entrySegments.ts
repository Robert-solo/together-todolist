import { parseISO, startOfDay, addDays } from 'date-fns'
import type { TimeEntry } from '../types'

export interface DaySegment {
  /** Minutes from the start of the day to the top of the block. */
  offsetMinutes: number
  /** Visible length in minutes, already clipped to this day. */
  durationMinutes: number
  /** True when the entry starts before this day (continuation from yesterday). */
  isContinuation: boolean
  /** True when the entry ends after this day (continues into tomorrow). */
  continuesAfter: boolean
}

/**
 * Clip an absolute time range (ms) against one calendar day.
 * Returns null when the range does not touch the day at all.
 */
export function segmentForRange(startMs: number, endMs: number, day: Date): DaySegment | null {
  if (!(endMs > startMs)) return null

  const dayStart = startOfDay(day).getTime()
  const dayEnd = addDays(startOfDay(day), 1).getTime()

  const from = Math.max(startMs, dayStart)
  const to = Math.min(endMs, dayEnd)
  if (to <= from) return null

  return {
    offsetMinutes: (from - dayStart) / 60000,
    durationMinutes: (to - from) / 60000,
    isContinuation: startMs < dayStart,
    continuesAfter: endMs > dayEnd,
  }
}

/**
 * Clip an entry against one calendar day.
 * Returns null when the entry does not touch the day at all.
 */
export function segmentForDay(entry: TimeEntry, day: Date): DaySegment | null {
  if (!entry.endTime) return null
  return segmentForRange(parseISO(entry.startTime).getTime(), parseISO(entry.endTime).getTime(), day)
}

/** True when any part of the entry falls on the given day. */
export function entryTouchesDay(entry: TimeEntry, day: Date): boolean {
  return segmentForDay(entry, day) !== null
}

/** Entries overlapping the day, including ones that began the day before. */
export function entriesOnDay(entries: TimeEntry[], day: Date): TimeEntry[] {
  return entries.filter((e) => segmentForDay(e, day) !== null)
}

export function isCrossDay(entry: TimeEntry): boolean {
  if (!entry.endTime) return false
  return entry.startTime.slice(0, 10) !== entry.endTime.slice(0, 10)
}
