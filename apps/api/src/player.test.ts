import { describe, expect, it } from 'vitest'
import { AccessTokenSchema } from 'contracts'
import { createPlayer, hashToken, playerKeys, tokenMatches } from './player.js'

const now = new Date('2026-10-11T14:00:00.000Z')

function fixedBytes(size: number): Buffer {
  return Buffer.alloc(size, size === 4 ? 0xab : 0xcd)
}

describe('createPlayer', () => {
  it('starts a new player at score 0 and returns the raw token once', () => {
    const created = createPlayer(now, fixedBytes)

    expect(created.playerId).toBe('anon_abababab')
    expect(created.score).toBe(0)
    expect(created.wins).toBe(0)
    expect(created.losses).toBe(0)
    expect(created.createdAt).toBe('2026-10-11T14:00:00.000Z')
    expect(AccessTokenSchema.safeParse(created.accessToken).success).toBe(true)
    expect(created.accessTokenHash).not.toBe(created.accessToken)
    expect(created.accessTokenHash).toBe(hashToken(created.accessToken))
  })
})

describe('tokenMatches', () => {
  const created = createPlayer(now, fixedBytes)

  it('accepts the token that was just created', () => {
    expect(tokenMatches(created.accessTokenHash, created.accessToken)).toBe(true)
  })

  it('rejects a token that differs by one character', () => {
    const flipped = `${created.accessToken.slice(0, -1)}0`
    expect(tokenMatches(created.accessTokenHash, flipped)).toBe(false)
  })

  it('rejects a short token without throwing', () => {
    expect(tokenMatches(created.accessTokenHash, 'abc')).toBe(false)
    expect(tokenMatches('abc', created.accessToken)).toBe(false)
  })
})

describe('playerKeys', () => {
  it('stores a player under PLAYER#id / PLAYER', () => {
    expect(playerKeys('anon_abababab')).toEqual({
      pk: 'PLAYER#anon_abababab',
      sk: 'PLAYER',
    })
  })
})
