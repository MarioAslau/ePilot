import { describe, expect, it } from 'vitest'
import { memoryGameStore } from '../memoryStore.js'
import { createPlayer } from '../player.js'
import type { PlayerRecord, PlayerStore } from '../playerStore.js'
import { handleCreatePlayer } from './createPlayer.js'
import { handleMe } from './me.js'

const now = new Date('2026-10-11T14:00:00.000Z')

function memoryStore(seed: PlayerRecord[] = []): PlayerStore & { records: PlayerRecord[] } {
  const records = [...seed]
  return {
    records,
    async putNew(record) {
      if (records.some((item) => item.playerId === record.playerId)) return 'exists'
      records.push(record)
      return 'created'
    },
    async get(playerId) {
      return records.find((item) => item.playerId === playerId) ?? null
    },
  }
}

describe('handleCreatePlayer', () => {
  it('returns the raw token once and stores only the hash', async () => {
    const store = memoryStore()
    const response = await handleCreatePlayer('req-1', {
      store,
      now: () => now,
      nextBytes: (size) => Buffer.alloc(size, 0x11),
    })
    const body = JSON.parse(response.body) as { playerId: string; accessToken: string }

    expect(response.statusCode).toBe(200)
    expect(body.playerId).toBe('anon_11111111')
    expect(body).not.toHaveProperty('accessTokenHash')
    expect(store.records[0]?.accessTokenHash).not.toBe(body.accessToken)
    expect(store.records[0]?.score).toBe(0)
  })

  it('retries when the player id already exists', async () => {
    const records: PlayerRecord[] = []
    let puts = 0
    let ids = 0
    const store: PlayerStore = {
      async putNew(record) {
        puts += 1
        if (puts === 1) return 'exists'
        records.push(record)
        return 'created'
      },
      async get() {
        return null
      },
    }
    const response = await handleCreatePlayer('req-2', {
      store,
      now: () => now,
      nextBytes: (size) => {
        const buf = Buffer.alloc(size, 0x22)
        if (size === 4) {
          buf[0] = ids
          ids += 1
        }
        return buf
      },
    })
    const body = JSON.parse(response.body) as { playerId: string }

    expect(response.statusCode).toBe(200)
    expect(puts).toBe(2)
    expect(body.playerId).toBe('anon_01222222')
    expect(records).toHaveLength(1)
  })
})

describe('handleMe', () => {
  it('returns score 0 and no prediction for a matching token', async () => {
    const created = createPlayer(now, (size) => Buffer.alloc(size, 0xab))
    const store = memoryStore([created])
    const response = await handleMe(
      `Bearer ${created.playerId}.${created.accessToken}`,
      'req-4',
      { players: store, predictions: memoryGameStore(), now: () => now },
    )
    const body = JSON.parse(response.body) as {
      score: number
      activePrediction: null
      waitReason: null
    }

    expect(response.statusCode).toBe(200)
    expect(body.score).toBe(0)
    expect(body.activePrediction).toBeNull()
    expect(body.waitReason).toBeNull()
  })

  it('returns 401 when the token hash does not match', async () => {
    const created = createPlayer(now, (size) => Buffer.alloc(size, 0xab))
    const store = memoryStore([created])
    const wrong = `${created.accessToken.slice(0, -1)}0`
    const response = await handleMe(
      `Bearer ${created.playerId}.${wrong}`,
      'req-5',
      { players: store, predictions: memoryGameStore(), now: () => now },
    )
    const body = JSON.parse(response.body) as { code: string }

    expect(response.statusCode).toBe(401)
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('returns 401 when the header is missing', async () => {
    const response = await handleMe(undefined, 'req-6', {
      players: memoryStore(),
      predictions: memoryGameStore(),
      now: () => now,
    })
    expect(response.statusCode).toBe(401)
  })
})
