import { readStored, writeStored } from './storage'

const KEY = 'hunch.seenOffers'
const LIMIT = 10

/** Offer ids this tab has shown open, newest last, so a reload can say how they ended. */
export function readSeenOffers(storage?: Storage): string[] {
  try {
    const parsed: unknown = JSON.parse(readStored(KEY, storage ?? 'session') ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string').slice(-LIMIT) : []
  } catch {
    return []
  }
}

export function rememberSeenOffer(offerId: string, storage?: Storage): string[] {
  const current = readSeenOffers(storage)
  const next = current.includes(offerId) ? current : [...current, offerId].slice(-LIMIT)
  writeStored(KEY, JSON.stringify(next), storage ?? 'session')
  return next
}
