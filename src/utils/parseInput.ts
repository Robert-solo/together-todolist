import type { ParsedInput } from '../types'
import { useEntryStore } from '../store/entryStore'

/**
 * One "H:MM" token. Accepts `:` or `.` as the separator. The lookarounds
 * reject adjacent digits *and* dots so date fragments like `2026.11.10`
 * are never mistaken for a time.
 */
const TIME_SRC = String.raw`(?<![\d.])(\d{1,2})[:.](\d{2})(?![\d.])`

/** Separators users actually type between two times. */
const SEP_SRC = String.raw`\s*(?:-|~|到|至)\s*`

/** Explicit "this lands tomorrow" markers. */
const NEXT_DAY_SRC = String.raw`(?:次日|第二天|翌日|\+1天?|＋1天?)`

/**
 * Optional date prefix in front of a time: `11-22 `, `11/22 `, `2026-11-22 `.
 * Three capture groups (year, month, day) so group numbering stays stable
 * whether or not the year is written. The lookbehind only blocks digits and
 * dots, so a date may follow the `-` separator (`17:08-11-23 04:01`).
 */
const DATE_OPT_SRC = String.raw`(?:(?<![\d.])(?:(\d{4})[/-])?(\d{1,2})[/-](\d{1,2})日?\s*)?`

const RANGE_RE = new RegExp(
  `${DATE_OPT_SRC}${TIME_SRC}${SEP_SRC}(?:${NEXT_DAY_SRC}\\s*)?${DATE_OPT_SRC}${TIME_SRC}`,
  'g'
)
const NEXT_DAY_RE = new RegExp(NEXT_DAY_SRC)
const SINGLE_RE = new RegExp(TIME_SRC, 'g')

/**
 * Collapse the many ways people write time down to `H:MM`.
 * 全角数字/冒号、`点`/`时` 口语写法、各种破折号都在这里统一。
 */
function normalize(raw: string): string {
  return raw
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ':')
    .replace(/[～]/g, '~')
    .replace(/[－–—−]/g, '-')
    .replace(/(\d{1,2})\s*[点时]\s*半/g, '$1:30')
    .replace(/(\d{1,2})\s*[点时]\s*(\d{1,2})\s*分?/g, '$1:$2')
    .replace(/(\d{1,2})\s*[点时](?!\d)/g, '$1:00')
}

const toMinutes = (h: string, m: string): number | null => {
  const hour = Number(h)
  const min = Number(m)
  if (hour > 23 || min > 59) return null
  return hour * 60 + min
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * Normalize a single clock time typed into an `<input>` into `HH:MM`.
 * Accepts `9:00`, `17.08`, `9点`, `9点半`, full-width digits — returns null
 * when the value cannot be understood, so the caller can show a clear error.
 */
export function normalizeClockTime(input: string): string | null {
  const s = normalize(input).trim()
  if (!s) return null
  const m = s.match(new RegExp(`^${TIME_SRC}$`))
  if (!m) return null
  const total = toMinutes(m[1], m[2])
  return total === null ? null : fmtHM(total)
}

/** `HH:MM` for a minute-of-day value, wrapping past midnight. */
const fmtHM = (total: number) => {
  const t = ((total % 1440) + 1440) % 1440
  return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`
}

/** Shift a `YYYY-MM-DD` string by whole days, timezone-safely. */
function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * Turn optional `YYYY? MM DD` groups into a calendar date.
 * Falls back to `fallback`, then rolls the month/year forward when the
 * written date sits before the fallback (so `12-28 … 01-03` works).
 */
function resolveDate(
  year: string | undefined,
  month: string | undefined,
  day: string | undefined,
  fallback: string
): string {
  if (!month || !day) return fallback

  const mo = Number(month)
  const dd = Number(day)
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return fallback

  const fallbackYear = Number(fallback.slice(0, 4))
  const y = year ? Number(year) : fallbackYear

  const candidate = `${y}-${pad2(mo)}-${pad2(dd)}`
  if (year) return candidate

  // No year written: take the next occurrence at or after the fallback date.
  return candidate >= fallback.slice(0, 10) ? candidate : `${y + 1}-${pad2(mo)}-${pad2(dd)}`
}

export function parseInput(raw: string, baseDate: string): ParsedInput {
  const categories = useEntryStore.getState().categories
  let str = normalize(raw.trim())

  // Extract category: #名称
  let categoryId: string | null = null
  const catMatch = str.match(/#\s*(\S+)/)
  if (catMatch) {
    const catName = catMatch[1]
    const found = categories.find((c) => c.name === catName)
    if (found) categoryId = found.id
    str = str.replace(catMatch[0], ' ').trim()
  }

  // Extract memo: · content (after the first ·)
  let memo = ''
  const dotIdx = str.indexOf('·')
  if (dotIdx !== -1) {
    memo = str.slice(dotIdx + 1).trim()
    str = str.slice(0, dotIdx).trim()
  }

  let startTime: string | null = null
  let endTime: string | null = null

  // First try a range anywhere in the string: `14:00 - 16:00`, `11-22 17:08 - 11-23 04:01` …
  RANGE_RE.lastIndex = 0
  for (let m = RANGE_RE.exec(str); m; m = RANGE_RE.exec(str)) {
    const from = toMinutes(m[4], m[5])
    const to = toMinutes(m[9], m[10])
    if (from === null || to === null) continue

    // Dates written with the times override the base date entirely, so
    // `11-22 17:08 - 11-23 04:01` no longer relies on "end < start" guessing.
    const startDate = resolveDate(m[1], m[2], m[3], baseDate)
    const hasEndDate = m[6] || m[7]
    const endDate = hasEndDate ? resolveDate(m[6], m[7], m[8], startDate) : startDate

    const explicitNextDay = NEXT_DAY_RE.test(m[0])
    let endOfDay = to
    if (!hasEndDate && (explicitNextDay || endOfDay <= from)) endOfDay += 1440

    startTime = `${startDate}T${fmtHM(from)}:00`

    if (hasEndDate) {
      endTime = `${endDate}T${fmtHM(endOfDay)}:00`
    } else if (endOfDay >= 1440) {
      endTime = `${addDaysISO(startDate, 1)}T${fmtHM(endOfDay)}:00`
    } else {
      endTime = `${startDate}T${fmtHM(endOfDay)}:00`
    }

    str = (str.slice(0, m.index) + ' ' + str.slice(m.index + m[0].length)).trim()
    break
  }

  // Otherwise a single time anywhere: `9:30 写论文`
  if (!startTime) {
    SINGLE_RE.lastIndex = 0
    for (let m = SINGLE_RE.exec(str); m; m = SINGLE_RE.exec(str)) {
      const at = toMinutes(m[1], m[2])
      if (at === null) continue
      startTime = `${baseDate}T${fmtHM(at)}:00`
      str = (str.slice(0, m.index) + ' ' + str.slice(m.index + m[0].length)).trim()
      break
    }
  }

  return {
    startTime,
    endTime,
    title: cleanTitle(str),
    memo,
    categoryId,
  }
}

/** Drop separator punctuation left behind after a time token was removed. */
function cleanTitle(str: string): string {  const cleaned = str
    .replace(/\s+/g, ' ')
    .replace(/^[-~到至]+\s*|\s*[-~到至]+$/g, '')
    .trim()
  return cleaned || '无标题'
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h${m}m`
}

export function entryDurationMinutes(start: string, end: string | null): number {
  if (!end) return 0
  const diff = new Date(end).getTime() - new Date(start).getTime()
  return Math.round(diff / 60000)
}
