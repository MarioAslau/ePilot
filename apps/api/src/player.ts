import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { AccessTokenSchema, PlayerIdSchema } from 'contracts'

export interface CreatedPlayer {
  playerId: string
  accessToken: string
  accessTokenHash: string
  score: 0
  wins: 0
  losses: 0
  createdAt: string
}

export function playerKeys(playerId: string): { pk: string; sk: string } {
  return { pk: `PLAYER#${playerId}`, sk: 'PLAYER' }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Compare a presented token with the stored SHA-256 hex hash.
 * Different lengths return false. timingSafeEqual throws on unequal buffers.
 */
export function tokenMatches(storedHash: string, presentedToken: string): boolean {
  const presentedHash = hashToken(presentedToken)
  const stored = Buffer.from(storedHash)
  const presented = Buffer.from(presentedHash)
  if (stored.length !== presented.length) return false
  return timingSafeEqual(stored, presented)
}

export function createPlayer(
  now: Date,
  nextBytes: (size: number) => Buffer = randomBytes,
): CreatedPlayer {
  const playerId = PlayerIdSchema.parse(`anon_${nextBytes(4).toString('hex')}`)
  const accessToken = AccessTokenSchema.parse(nextBytes(32).toString('hex'))
  return {
    playerId,
    accessToken,
    accessTokenHash: hashToken(accessToken),
    score: 0,
    wins: 0,
    losses: 0,
    createdAt: now.toISOString(),
  }
}

const PLAYER_AUTH = /^Bearer (anon_[0-9a-f]{8})\.([0-9a-f]{64})$/

export function readPlayerAuthorization(
  header: string | undefined,
): { playerId: string; accessToken: string } | null {
  if (!header) return null
  const match = PLAYER_AUTH.exec(header)
  if (!match?.[1] || !match[2]) return null
  return { playerId: match[1], accessToken: match[2] }
}
