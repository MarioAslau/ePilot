const memory = new Map<string, string>()
/** Survives a Strict Mode remount that happens before the id is stored. */
const showing = new Set<string>()

function key(playerId: string): string {
  return `hunch.seenResult.${playerId}`
}

export function readSeenResult(playerId: string, storage: Pick<Storage, 'getItem'> = localStorage): string | null {
  try {
    return storage.getItem(key(playerId))
  } catch {
    return memory.get(playerId) ?? null
  }
}

export function markSeenResult(
  playerId: string,
  predictionId: string,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    storage.setItem(key(playerId), predictionId)
  } catch {
    memory.set(playerId, predictionId)
  }
}

/** True the first time this result should flash. Stays true until it is stored. */
export function shouldAnimate(playerId: string, predictionId: string, storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  if (readSeenResult(playerId, storage) === predictionId) return false
  const id = `${playerId}:${predictionId}`
  if (showing.has(id)) return true
  showing.add(id)
  return true
}
