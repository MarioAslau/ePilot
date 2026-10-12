import { readStored, writeStored } from './storage'

/** Survives a Strict Mode remount that happens before the id is stored. */
const showing = new Set<string>()

function key(playerId: string): string {
  return `hunch.seenResult.${playerId}`
}

export function readSeenResult(playerId: string, storage?: Pick<Storage, 'getItem'>): string | null {
  return readStored(key(playerId), storage ?? 'local')
}

export function markSeenResult(
  playerId: string,
  predictionId: string,
  storage?: Pick<Storage, 'setItem'>,
): void {
  writeStored(key(playerId), predictionId, storage ?? 'local')
}

/** True the first time this result should flash. Stays true until it is stored. */
export function shouldAnimate(playerId: string, predictionId: string, storage?: Pick<Storage, 'getItem'>): boolean {
  if (readSeenResult(playerId, storage) === predictionId) return false
  const id = `${playerId}:${predictionId}`
  if (showing.has(id)) return true
  showing.add(id)
  return true
}
