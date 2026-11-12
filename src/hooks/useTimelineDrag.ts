import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { addMinutes, format, parseISO, startOfDay } from 'date-fns'
import type { TimeEntry } from '../types'
import type { WriteResult } from '../store/entryStore'
import { useEntryStore } from '../store/entryStore'
import { findConflict } from '../utils/conflict'
import type { DaySegment } from '../utils/entrySegments'

/** 时间轴上的长按手势：长按空白新建、长按事件拖动、长按/按住边缘调整时长。 */

export const SNAP_MINUTES = 15
export const LONG_PRESS_MS = 380
const MOVE_SLOP = 9                 // 长按等待期内手指/鼠标漂移超过它就视为滚动，取消
const DEFAULT_MINUTES = 60          // 新建事件默认时长
const MS_MIN = 60_000
const EDGE_MOUSE = 8                // 事件上/下边缘的热区（px）
const EDGE_TOUCH = 16
const SCROLL_ZONE = 56              // 拖到容器边缘这一圈时自动滚动
const SCROLL_MAX = 16
const MAX_SPAN_MS = 7 * 24 * 60 * MS_MIN

export type DragMode = 'move' | 'resize-start' | 'resize-end' | 'create'

export interface DragPreview {
  mode: DragMode
  entryId?: string
  title?: string
  color?: string
  start: number   // 绝对毫秒
  end: number
  valid: boolean
}

export type PressState =
  | { kind: 'entry'; entryId: string }
  | { kind: 'empty'; dateKey: string; x: number; y: number }
  | null

export interface CreateRange {
  date: string
  startMinutes: number
  endMinutes: number   // 可能等于 1440（次日 00:00）
}

interface Ctx {
  entries: TimeEntry[]
  updateEntry: (id: string, patch: Partial<TimeEntry>) => WriteResult
  scrollRef: RefObject<HTMLElement>
  /** 时间轴列一共多少小时（含 24:00 的那条线，通常是 25） */
  totalHours: number
  onTap: (entryId: string) => void
  onCreate: (range: CreateRange) => void
}

interface UI {
  setPreview: (p: DragPreview | null) => void
  setPress: (p: PressState) => void
  notify: (message: string) => void
}

interface Session {
  mode: DragMode
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  colKey: string
  entry?: TimeEntry
  title?: string
  color?: string
  entryStart: number
  entryEnd: number
  grabOffset: number   // 按下点相对事件开始的分钟数
  immediate: boolean   // 鼠标直接按在边缘：不用等长按
  active: boolean
  timer: number
  preview: DragPreview | null
}

type Zone = 'top' | 'body' | 'bottom'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const snap = (minutes: number) => Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
const iso = (ms: number) => format(ms, "yyyy-MM-dd'T'HH:mm:ss")
const dayBase = (key: string) => startOfDay(parseISO(key))

function haptic(pattern: number | number[]) {
  try { navigator.vibrate?.(pattern) } catch { /* 部分浏览器不支持 */ }
}

function zoneOf(el: HTMLElement, clientY: number, pointerType: string, seg: DaySegment): Zone {
  const rect = el.getBoundingClientRect()
  const y = clientY - rect.top
  const edge = Math.min(pointerType === 'mouse' ? EDGE_MOUSE : EDGE_TOUCH, rect.height * 0.3)
  if (!seg.isContinuation && y < edge) return 'top'
  if (!seg.continuesAfter && y > rect.height - edge) return 'bottom'
  return 'body'
}

function createEngine(getCtx: () => Ctx, ui: UI) {
  const cols = new Map<string, HTMLElement>()
  let session: Session | null = null
  let raf = 0

  function locate(x: number, y: number, lockKey?: string) {
    const { totalHours } = getCtx()
    let pick: { key: string; rect: DOMRect } | null = null
    if (lockKey) {
      const el = cols.get(lockKey)
      if (el) pick = { key: lockKey, rect: el.getBoundingClientRect() }
    } else {
      let best = Infinity
      for (const [key, el] of cols) {
        const r = el.getBoundingClientRect()
        const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
        if (dx < best) { best = dx; pick = { key, rect: r } }
      }
    }
    if (!pick) return null
    // 用渲染后的列高占比换算，CSS zoom / 缩放下也准确
    return { key: pick.key, minutes: ((y - pick.rect.top) / pick.rect.height) * totalHours * 60 }
  }

  function compute(s: Session): DragPreview | null {
    const loc = locate(s.lastX, s.lastY, s.mode === 'move' || s.mode === 'create' ? undefined : s.colKey)
    if (!loc) return null
    const { entries } = getCtx()
    const base = dayBase(loc.key)
    const at = (min: number) => addMinutes(base, min).getTime()
    let start = s.entryStart
    let end = s.entryEnd

    switch (s.mode) {
      case 'move': {
        const startMin = clamp(snap(loc.minutes - s.grabOffset), 0, 1440 - SNAP_MINUTES)
        start = at(startMin)
        end = start + (s.entryEnd - s.entryStart)
        break
      }
      case 'resize-end':
        end = Math.max(at(snap(loc.minutes)), s.entryStart + SNAP_MINUTES * MS_MIN)
        break
      case 'resize-start':
        start = Math.min(at(snap(loc.minutes)), s.entryEnd - SNAP_MINUTES * MS_MIN)
        break
      case 'create': {
        const startMin = clamp(Math.floor(loc.minutes / SNAP_MINUTES) * SNAP_MINUTES, 0, 1440 - SNAP_MINUTES)
        start = at(startMin)
        end = Math.min(start + DEFAULT_MINUTES * MS_MIN, at(1440))
        // 默认一小时，但不压到后面的日程：缩短到它开始的地方
        for (const e of entries) {
          if (!e.endTime) continue
          const es = parseISO(e.startTime).getTime()
          if (es >= start && es < end) end = es
        }
        break
      }
    }

    const long = end - start > MAX_SPAN_MS
    const tooShort = end - start < SNAP_MINUTES * MS_MIN
    const conflict = !long && !tooShort && findConflict(entries, { startTime: iso(start), endTime: iso(end) }, s.entry?.id)
    return {
      mode: s.mode,
      entryId: s.entry?.id,
      title: s.title,
      color: s.color,
      start,
      end,
      valid: !long && !tooShort && !conflict,
    }
  }

  function refresh() {
    if (!session) return
    session.preview = compute(session)
    ui.setPreview(session.preview)
  }

  function tick() {
    raf = 0
    const s = session
    if (!s || !s.active) return
    const el = getCtx().scrollRef.current
    if (el) {
      const r = el.getBoundingClientRect()
      const ease = (depth: number) => Math.min(SCROLL_MAX, 2 + depth / 4)
      let dy = 0
      let dx = 0
      if (s.lastY < r.top + SCROLL_ZONE) dy = -ease(r.top + SCROLL_ZONE - s.lastY)
      else if (s.lastY > r.bottom - SCROLL_ZONE) dy = ease(s.lastY - (r.bottom - SCROLL_ZONE))
      if (s.mode === 'move' || s.mode === 'create') {
        if (s.lastX < r.left + SCROLL_ZONE) dx = -ease(r.left + SCROLL_ZONE - s.lastX)
        else if (s.lastX > r.right - SCROLL_ZONE) dx = ease(s.lastX - (r.right - SCROLL_ZONE))
      }
      if (dx || dy) {
        el.scrollTop += dy
        el.scrollLeft += dx
        refresh()
      }
    }
    raf = requestAnimationFrame(tick)
  }

  function activate(s: Session) {
    if (session !== s || s.active) return
    s.active = true
    s.timer = 0
    document.body.classList.add('is-dragging')
    document.body.dataset.drag = s.mode.startsWith('resize') ? 'resize' : 'move'
    haptic(s.mode === 'create' ? 18 : 14)
    ui.setPress(null)
    refresh()
    if (!raf) raf = requestAnimationFrame(tick)
  }

  function cleanup() {
    const s = session
    session = null
    if (s?.timer) window.clearTimeout(s.timer)
    if (raf) { cancelAnimationFrame(raf); raf = 0 }
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    document.body.classList.remove('is-dragging')
    delete document.body.dataset.drag
    ui.setPreview(null)
    ui.setPress(null)
  }

  function commit(s: Session) {
    const p = s.preview
    if (!p) return
    const ctx = getCtx()

    if (!p.valid) {
      haptic([10, 40, 10])
      ui.notify(
        s.mode === 'create'
          ? '这里放不下新事件，已取消'
          : '该时间段已有日程，已还原到原来的位置'
      )
      return
    }

    if (s.mode === 'create') {
      const dayStart = startOfDay(p.start).getTime()
      ctx.onCreate({
        date: format(p.start, 'yyyy-MM-dd'),
        startMinutes: Math.round((p.start - dayStart) / MS_MIN),
        endMinutes: Math.round((p.end - dayStart) / MS_MIN),
      })
      return
    }

    if (!s.entry || (p.start === s.entryStart && p.end === s.entryEnd)) return
    const result = ctx.updateEntry(s.entry.id, { startTime: iso(p.start), endTime: iso(p.end) })
    if (result.ok) {
      haptic(8)
    } else {
      haptic([10, 40, 10])
      ui.notify(result.kind === 'conflict' ? '该时间段已有日程，已还原到原来的位置' : result.message)
    }
  }

  function onMove(e: PointerEvent) {
    const s = session
    if (!s || e.pointerId !== s.pointerId) return
    s.lastX = e.clientX
    s.lastY = e.clientY
    if (!s.active) {
      // 等待长按期间移动过多：这是滚动/划动，不是长按
      if (Math.hypot(e.clientX - s.startX, e.clientY - s.startY) > MOVE_SLOP) cleanup()
      return
    }
    refresh()
  }

  /**
   * 触摸松手后浏览器会合成一次 click，落点此时可能已是刚弹出的弹窗遮罩，
   * 会把它立刻关掉。手势结束后短时间内吞掉这次 click。
   */
  function swallowNextClick() {
    const stop = (ev: MouseEvent) => { ev.stopImmediatePropagation(); ev.preventDefault() }
    window.addEventListener('click', stop, true)
    window.setTimeout(() => window.removeEventListener('click', stop, true), 450)
  }

  function onUp(e: PointerEvent) {
    const s = session
    if (!s || e.pointerId !== s.pointerId) return
    const moved = Math.hypot(e.clientX - s.startX, e.clientY - s.startY) > MOVE_SLOP
    const wasTap = (!s.active || (s.immediate && !moved)) && !moved
    if (s.active && !wasTap) commit(s)
    cleanup()
    if (wasTap && s.entry) getCtx().onTap(s.entry.id)   // 点击 = 查看已有事件
    if (s.active || (wasTap && s.entry)) swallowNextClick()
  }

  function onCancel(e: PointerEvent) {
    if (session && e.pointerId === session.pointerId) cleanup()
  }

  function begin(init: Omit<Session, 'active' | 'timer' | 'lastX' | 'lastY' | 'preview'>) {
    cleanup()
    const s: Session = { ...init, active: false, timer: 0, lastX: init.startX, lastY: init.startY, preview: null }
    session = s
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    if (s.immediate) activate(s)
    else s.timer = window.setTimeout(() => activate(s), LONG_PRESS_MS)
  }

  return {
    isActive: () => !!session?.active,

    registerColumn(key: string, el: HTMLElement | null) {
      if (el) cols.set(key, el)
      else cols.delete(key)
    },

    downEntry(
      e: ReactPointerEvent<HTMLElement>,
      entry: TimeEntry,
      seg: DaySegment,
      dateKey: string,
      color: string
    ) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (!entry.endTime) return
      const zone = zoneOf(e.currentTarget, e.clientY, e.pointerType, seg)
      const mode: DragMode = zone === 'top' ? 'resize-start' : zone === 'bottom' ? 'resize-end' : 'move'
      const start = parseISO(entry.startTime).getTime()
      const end = parseISO(entry.endTime).getTime()
      const loc = locate(e.clientX, e.clientY, dateKey)
      begin({
        mode,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        colKey: dateKey,
        entry,
        title: entry.title,
        color,
        entryStart: start,
        entryEnd: end,
        grabOffset: loc ? loc.minutes - (start - dayBase(dateKey).getTime()) / MS_MIN : 0,
        immediate: e.pointerType === 'mouse' && mode !== 'move',
      })
      if (!session?.active) ui.setPress({ kind: 'entry', entryId: entry.id })
    },

    downEmpty(e: ReactPointerEvent<HTMLElement>, dateKey: string) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if ((e.target as HTMLElement).closest('[data-block]')) return
      const rect = e.currentTarget.getBoundingClientRect()
      begin({
        mode: 'create',
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        colKey: dateKey,
        entryStart: 0,
        entryEnd: 0,
        grabOffset: 0,
        immediate: false,
      })
      ui.setPress({ kind: 'empty', dateKey, x: e.clientX - rect.left, y: e.clientY - rect.top })
    },

    hover(e: ReactPointerEvent<HTMLElement>, seg: DaySegment) {
      if (session || e.pointerType !== 'mouse') return
      const zone = zoneOf(e.currentTarget, e.clientY, 'mouse', seg)
      e.currentTarget.style.cursor = zone === 'body' ? 'pointer' : 'ns-resize'
    },

    dispose: cleanup,
  }
}

interface Options {
  scrollRef: RefObject<HTMLElement>
  /** 时间轴列一共多少小时（含 24:00 那条线，通常是 25） */
  totalHours: number
  onTap: (entryId: string) => void
  onCreate: (range: CreateRange) => void
}

export function useTimelineDrag(opts: Options) {
  const entries = useEntryStore((s) => s.entries)
  const updateEntry = useEntryStore((s) => s.updateEntry)

  const [preview, setPreview] = useState<DragPreview | null>(null)
  const [press, setPress] = useState<PressState>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const ctx = useRef<Ctx>(null!)
  ctx.current = { entries, updateEntry, ...opts }

  const noticeTimer = useRef(0)
  const engineRef = useRef<ReturnType<typeof createEngine> | null>(null)
  if (!engineRef.current) {
    engineRef.current = createEngine(() => ctx.current, {
      setPreview,
      setPress,
      notify: (message) => {
        setNotice(message)
        window.clearTimeout(noticeTimer.current)
        noticeTimer.current = window.setTimeout(() => setNotice(null), 2400)
      },
    })
  }
  const engine = engineRef.current

  useEffect(() => () => {
    engine.dispose()
    window.clearTimeout(noticeTimer.current)
  }, [engine])

  // 长按进入拖动后，必须拦住触摸滚动（要求非 passive 监听）
  useEffect(() => {
    const el = opts.scrollRef.current
    if (!el) return
    const guard = (e: TouchEvent) => { if (engine.isActive() && e.cancelable) e.preventDefault() }
    el.addEventListener('touchmove', guard, { passive: false })
    return () => el.removeEventListener('touchmove', guard)
  }, [engine, opts.scrollRef])

  const colRefs = useRef(new Map<string, (el: HTMLElement | null) => void>())
  const columnRef = useCallback((key: string) => {
    let fn = colRefs.current.get(key)
    if (!fn) {
      fn = (el) => engine.registerColumn(key, el)
      colRefs.current.set(key, fn)
    }
    return fn
  }, [engine])

  const noMenu = (e: { preventDefault: () => void }) => e.preventDefault()

  return {
    preview,
    press,
    notice,
    columnProps: (dateKey: string) => ({
      ref: columnRef(dateKey),
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => engine.downEmpty(e, dateKey),
      onContextMenu: noMenu,
    }),
    entryProps: (entry: TimeEntry, seg: DaySegment, dateKey: string, color: string) => ({
      'data-block': '1',
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => engine.downEntry(e, entry, seg, dateKey, color),
      onPointerMove: (e: ReactPointerEvent<HTMLElement>) => engine.hover(e, seg),
      onContextMenu: noMenu,
    }),
  }
}
