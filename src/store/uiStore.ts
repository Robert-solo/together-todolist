import { create } from 'zustand'
import type { ViewMode } from '../types'
import { addWeeks, addDays, addMonths, format } from 'date-fns'

interface UIState {
  view: ViewMode
  currentDate: string   // ISO date string (YYYY-MM-DD)
  filterCategoryId: string | null
  inspirationOpen: boolean
  categoryManagerOpen: boolean
  editingEntryId: string | null
  setView: (v: ViewMode) => void
  setCurrentDate: (d: string) => void
  setFilter: (id: string | null) => void
  toggleInspiration: () => void
  setCategoryManager: (open: boolean) => void
  setEditingEntry: (id: string | null) => void
  navigate: (dir: 1 | -1, unit?: 'day' | 'week' | 'month') => void
}

const today = format(new Date(), 'yyyy-MM-dd')

export const useUIStore = create<UIState>()((set, get) => ({
  view: 'week',
  currentDate: today,
  filterCategoryId: null,
  inspirationOpen: false,
  categoryManagerOpen: false,
  editingEntryId: null,
  setView: (view) => set({ view }),
  setCurrentDate: (currentDate) => set({ currentDate }),
  setFilter: (filterCategoryId) => set({ filterCategoryId }),
  toggleInspiration: () =>
    set((s) => ({ inspirationOpen: !s.inspirationOpen })),
  setCategoryManager: (categoryManagerOpen) => set({ categoryManagerOpen }),
  setEditingEntry: (editingEntryId) => set({ editingEntryId }),
  navigate: (dir, unit) => {
    const { view, currentDate } = get()
    const d = new Date(currentDate + 'T12:00:00')
    const step = unit ?? (view === 'stats' ? 'week' : view)
    let next: Date
    if (step === 'day') next = addDays(d, dir)
    else if (step === 'week') next = addWeeks(d, dir)
    else next = addMonths(d, dir)
    set({ currentDate: format(next, 'yyyy-MM-dd') })
  },
}))
