export interface Category {
  id: string
  name: string
  color: string
  order: number
}

export interface TimeEntry {
  id: string
  startTime: string   // ISO string
  endTime: string | null
  title: string
  memo: string
  categoryId: string
  createdAt: string
}

export interface Inspiration {
  id: string
  content: string
  createdAt: string
  linkedEntryId?: string
}

export type ViewMode = 'day' | 'week' | 'month' | 'stats'

export interface ParsedInput {
  startTime: string | null
  endTime: string | null
  title: string
  memo: string
  categoryId: string | null
}
