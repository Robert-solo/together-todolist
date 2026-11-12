import { parseISO } from 'date-fns'

/**
 * 紧凑的时钟文本：`9:05`、`14:30`。
 * 小时不补前导零——数字用 tabular-nums 对齐，不靠补 0/补空格。
 */
export function fmtClock(value: string | Date): string {
  const d = typeof value === 'string' ? parseISO(value) : value
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}
