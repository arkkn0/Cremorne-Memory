import type { MemoryRule } from './domain'

const STORAGE_KEY = 'cremorne-memory:v1'

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
