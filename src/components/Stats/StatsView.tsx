import { useMemo, useState } from 'react'
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  format, parseISO, differenceInMinutes
} from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts'
import { useEntryStore } from '../../store/entryStore'
import { useUIStore } from '../../store/uiStore'
import { formatDuration } from '../../utils/parseInput'
import s from './StatsView.module.css'

type Range = 'this-week' | 'last-week' | 'this-month' | 'last-month'

export function StatsView() {
  const { entries, categories, deleteEntry } = useEntryStore()
  const { filterCategoryId, setFilter } = useUIStore()
  const [range, setRange] = useState<Range>('this-week')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const { start, end, label } = useMemo(() => {
    const now = new Date()
    switch (range) {
      case 'this-week':
        return {
          start: startOfWeek(now, { weekStartsOn: 1 }),
          end: endOfWeek(now, { weekStartsOn: 1 }),
          label: '本周',
        }
      case 'last-week': {
        const ls = startOfWeek(new Date(now.getTime() - 7 * 86400000), { weekStartsOn: 1 })
        return { start: ls, end: endOfWeek(ls, { weekStartsOn: 1 }), label: '上周' }
      }
      case 'this-month':
        return { start: startOfMonth(now), end: endOfMonth(now), label: '本月' }
      case 'last-month': {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        return { start: startOfMonth(lm), end: endOfMonth(lm), label: '上月' }
      }
    }
  }, [range])

  const rangeEntries = useMemo(
    () => entries.filter((e) => {
      const d = parseISO(e.startTime)
      return d >= start && d <= end
    }),
    [entries, start, end]
  )

  const filtered = filterCategoryId
    ? rangeEntries.filter((e) => e.categoryId === filterCategoryId)
    : rangeEntries

  const totalMins = filtered.reduce((acc, e) => {
    if (!e.endTime) return acc
    return acc + differenceInMinutes(parseISO(e.endTime), parseISO(e.startTime))
  }, 0)

  const recordedDays = new Set(
    filtered.map((e) => format(parseISO(e.startTime), 'yyyy-MM-dd'))
  ).size

  const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
  const avgMins = recordedDays > 0 ? Math.round(totalMins / recordedDays) : 0

  // Per-category breakdown
  const catMap = Object.fromEntries(categories.map((c) => [c.id, c]))
  const catMinutes: Record<string, number> = {}
  rangeEntries.forEach((e) => {
    if (!e.endTime) return
    const mins = differenceInMinutes(parseISO(e.endTime), parseISO(e.startTime))
    catMinutes[e.categoryId] = (catMinutes[e.categoryId] ?? 0) + mins
  })

  const catData = categories
    .map((c) => ({ ...c, mins: catMinutes[c.id] ?? 0 }))
    .filter((c) => c.mins > 0)
    .sort((a, b) => b.mins - a.mins)

  // Group records by day
  const grouped = useMemo(() => {
    const days: Record<string, typeof filtered> = {}
    filtered.forEach((e) => {
      const key = format(parseISO(e.startTime), 'yyyy-MM-dd')
      if (!days[key]) days[key] = []
      days[key].push(e)
    })
    return Object.entries(days).sort(([a], [b]) => b.localeCompare(a))
  }, [filtered])

  const RANGES: { key: Range; label: string }[] = [
    { key: 'this-week', label: '本周' },
    { key: 'last-week', label: '上周' },
    { key: 'this-month', label: '本月' },
    { key: 'last-month', label: '上月' },
  ]

  return (
    <div className={s.container}>
      {/* Range tabs */}
      <div className={s.rangeTabs}>
        {RANGES.map((r) => (
          <button
            key={r.key}
            className={`${s.rangeTab} ${range === r.key ? s.active : ''}`}
            onClick={() => setRange(r.key)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {filterCategoryId && (
        <div className={s.filterBanner}>
          分类筛选：{catMap[filterCategoryId]?.name}
          <button onClick={() => setFilter(null)}>✕ 清除</button>
        </div>
      )}

      {/* Stats cards */}
      <div className={s.statsGrid}>
        <div className={s.card}>
          <div className={s.cardLabel}>累计时长</div>
          <div className={s.cardVal}>
            {Math.floor(totalMins / 60)}
            <span className={s.cardUnit}>小时</span>
            {totalMins % 60 > 0 && <>{totalMins % 60}<span className={s.cardUnit}>分</span></>}
          </div>
        </div>
        <div className={s.card}>
          <div className={s.cardLabel}>记录条数</div>
          <div className={s.cardVal}>{filtered.length}<span className={s.cardUnit}> 条</span></div>
        </div>
        <div className={s.card}>
          <div className={s.cardLabel}>有记录天数</div>
          <div className={s.cardVal}>{recordedDays}<span className={s.cardUnit}> / {totalDays}</span></div>
        </div>
        <div className={s.card}>
          <div className={s.cardLabel}>有记录日均</div>
          <div className={s.cardVal}>
            {Math.floor(avgMins / 60)}
            <span className={s.cardUnit}>小时</span>
            {avgMins % 60 > 0 && <>{avgMins % 60}<span className={s.cardUnit}>分</span></>}
          </div>
        </div>
      </div>

      {/* Donut + bar chart */}
      {catData.length > 0 && (
        <div className={s.section}>
          <div className={s.sectionTitle}>分类投入占比 · {label}</div>
          <div className={s.chartRow}>
            <div className={s.donutWrap}>
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie
                    data={catData}
                    dataKey="mins"
                    cx="50%"
                    cy="50%"
                    innerRadius={44}
                    outerRadius={64}
                    strokeWidth={1.5}
                    stroke="var(--c-raised)"
                  >
                    {catData.map((c) => (
                      <Cell key={c.id} fill={c.color} opacity={filterCategoryId && filterCategoryId !== c.id ? 0.3 : 1} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className={s.donutCenter}>
                <span className={s.donutVal}>{Math.round(totalMins / 60 * 10) / 10}</span>
                <span className={s.donutLabel}>小时</span>
              </div>
            </div>

            <div className={s.barList}>
              <div className={s.barAllRow}>全部分类</div>
              {catData.map((c) => {
                const pct = totalMins > 0 ? (c.mins / totalMins) * 100 : 0
                const active = filterCategoryId === c.id
                return (
                  <div
                    key={c.id}
                    className={`${s.barItem} ${active ? s.barActive : ''}`}
                    onClick={() => setFilter(active ? null : c.id)}
                  >
                    <div className={s.barMeta}>
                      <span className={s.barDot} style={{ background: c.color }} />
                      <span className={s.barName}>{c.name}</span>
                      <span className={s.barTime}>{formatDuration(c.mins)}</span>
                      <span className={s.barPct}>{Math.round(pct)}%</span>
                    </div>
                    <div className={s.barTrack}>
                      <div
                        className={s.barFill}
                        style={{ width: `${pct}%`, background: c.color }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Record list */}
      {grouped.length > 0 && (
        <div className={s.section}>
          <div className={s.sectionTitle}>
            具体投入记录 · {format(start, 'yyyy-MM-dd')} ~ {format(end, 'yyyy-MM-dd')} · {filtered.length} 项
          </div>
          {grouped.map(([dateKey, dayEntries]) => {
            const dayMins = dayEntries.reduce((acc, e) => {
              if (!e.endTime) return acc
              return acc + differenceInMinutes(parseISO(e.endTime), parseISO(e.startTime))
            }, 0)
            return (
              <div key={dateKey} className={s.dayGroup}>
                <div className={s.dayHeader}>
                  <span className={s.dayDate}>
                    {format(parseISO(dateKey), 'yyyy / M / d · EEEE', { locale: zhCN })}
                  </span>
                  <span className={s.dayTotal}>{formatDuration(dayMins)}</span>
                </div>
                {dayEntries.map((e) => {
                  const cat = catMap[e.categoryId]
                  const mins = e.endTime
                    ? differenceInMinutes(parseISO(e.endTime), parseISO(e.startTime))
                    : 0
                  const confirming = confirmId === e.id
                  return (
                    <div key={e.id} className={s.entryRow}>
                      <span className={s.entryTime}>
                        {format(parseISO(e.startTime), 'HH:mm')}
                        {e.endTime && `–${format(parseISO(e.endTime), 'HH:mm')}`}
                      </span>
                      <span className={s.entryTitle}>{e.title}</span>
                      {cat && (
                        <span className={s.entryCat} style={{ background: `color-mix(in oklch, ${cat.color} 16%, transparent)`, color: cat.color }}>
                          {cat.name}
                        </span>
                      )}
                      {mins > 0 && <span className={s.entryDur}>{formatDuration(mins)}</span>}
                      {confirming ? (
                        <span className={s.confirmGroup}>
                          <button
                            className={s.confirmYes}
                            onClick={() => { deleteEntry(e.id); setConfirmId(null) }}
                          >
                            确认删除
                          </button>
                          <button
                            className={s.confirmNo}
                            onClick={() => setConfirmId(null)}
                          >
                            取消
                          </button>
                        </span>
                      ) : (
                        <button
                          className={s.entryDel}
                          onClick={() => setConfirmId(e.id)}
                          aria-label={`删除 ${e.title}`}
                          title="删除记录"
                        >
                          <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <line x1="3" y1="3" x2="11" y2="11" strokeLinecap="round"/>
                            <line x1="11" y1="3" x2="3" y2="11" strokeLinecap="round"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {filtered.length === 0 && (
        <div className={s.empty}>这段时间还没有记录</div>
      )}
    </div>
  )
}
