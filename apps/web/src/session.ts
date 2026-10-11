const KEY = 'hunch.session'

export interface Session {
  playerId: string
  accessToken: string
}

export class StorageUnavailableError extends Error {
  constructor() {
    super('This browser could not save your player.')
    this.name = 'StorageUnavailableError'
  }
}

export function readSession(): Session | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    throw new StorageUnavailableError()
  }
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'playerId' in parsed &&
      'accessToken' in parsed &&
      typeof parsed.playerId === 'string' &&
      typeof parsed.accessToken === 'string'
    ) {
      return { playerId: parsed.playerId, accessToken: parsed.accessToken }
    }
  } catch {
    return null
  }
  return null
}

export function writeSession(session: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    throw new StorageUnavailableError()
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    throw new StorageUnavailableError()
  }
}
