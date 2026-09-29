import type { MemoryRule } from './domain'

const STORAGE_KEY = 'cremorne-memory:v1'
const OUTCOME_STORAGE_KEY = 'cremorne-outcomes:v1'

export interface JourneyOutcome {
  routeId: string
  routeName: string
  completedAt: string
  elapsedSeconds: number
  predictedMinutes: number
  exposureIndex: number
  feedback: 'better' | 'same' | 'worse'
}

export function loadMemory(): MemoryRule[] {
  if (typeof window === 'undefined') return []
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value ? (JSON.parse(value) as MemoryRule[]) : []
  } catch {
    return []
  }
}

export function saveRule(rule: MemoryRule): MemoryRule[] {
  const current = loadMemory()
  const next = [rule, ...current.filter((item) => item.id !== rule.id)]
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function clearMemory() {
  window.localStorage.removeItem(STORAGE_KEY)
}

export function saveJourneyOutcome(outcome: JourneyOutcome) {
  if (typeof window === 'undefined') return []
  const current = loadJourneyOutcomes()
  const next = [outcome, ...current].slice(0, 20)
  window.localStorage.setItem(OUTCOME_STORAGE_KEY, JSON.stringify(next))
  return next
}

export function loadJourneyOutcomes(): JourneyOutcome[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(window.localStorage.getItem(OUTCOME_STORAGE_KEY) ?? '[]') as JourneyOutcome[]
  } catch {
    return []
  }
}
