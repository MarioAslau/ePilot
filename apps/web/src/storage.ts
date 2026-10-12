/**
 * Small values the page remembers between reloads. When the browser blocks storage,
 * they live in memory for this page instead, so the feature degrades rather than breaks.
 * The player session does not use this: losing it must be reported, not hidden.
 */
const memory = new Map<string, string>()

type Area = 'local' | 'session'

function area(name: Area): Storage {
  return name === 'local' ? localStorage : sessionStorage
}

export function readStored(key: string, where: Area | Pick<Storage, 'getItem'>): string | null {
  try {
    return (typeof where === 'string' ? area(where) : where).getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}

export function writeStored(key: string, value: string, where: Area | Pick<Storage, 'setItem'>): void {
  memory.set(key, value)
  try {
    const storage = typeof where === 'string' ? area(where) : where
    storage.setItem(key, value)
  } catch {
    // Memory already holds it.
  }
}
