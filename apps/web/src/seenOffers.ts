const KEY = 'hunch.seenOffers'
const memory: string[] = []

function box(storage?: Storage): Storage | null {
  try {
    return storage ?? sessionStorage
  } catch {
    return null
  }
}

export function readSeenOffers(storage?: Storage): string[] {
  const available = box(storage)
  if (!available) return memory.slice(-10)
  try {
    const raw = available.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return memory.slice(-10)
    return parsed.filter((id): id is string => typeof id === 'string').slice(-10)
  } catch {
    return memory.slice(-10)
  }
}

export function rememberSeenOffer(offerId: string, storage?: Storage): string[] {
  const current = readSeenOffers(storage)
  const next = current.includes(offerId) ? current : [...current, offerId].slice(-10)
  memory.splice(0, memory.length, ...next)
  const available = box(storage)
  if (!available) return next
  try {
    available.setItem(KEY, JSON.stringify(next))
  } catch {
    return next
  }
  return next
}
