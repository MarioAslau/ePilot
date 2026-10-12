import { createPlayer } from '../player.js'
import { memoryGameStore } from '../memoryStore.js'
import type { TickerQuote } from '../coinbase.js'
import { ProviderUnavailableError } from '../coinbase.js'
import { handleCreatePrediction } from './createPrediction.js'
import { handleResolvePrediction } from './resolvePrediction.js'
import { describe, expect, it } from 'vitest'

const createdAt = new Date('2026-10-11T15:00:00.000Z')
const entry: TickerQuote = {
  price: '83062.64',
  tradeTime: '2026-10-11T14:59:58.000Z',
  fetchedAt: createdAt.toISOString(),
}

function moved(price: string): TickerQuote {
  return {
    price,
    tradeTime: '2026-10-11T15:01:02.000Z',
    fetchedAt: '2026-10-11T15:01:03.000Z',
  }
}

async function pendingRound() {
  const store = memoryGameStore()
  const created = createPlayer(createdAt, (size) => Buffer.alloc(size, 7))
  await store.putNew(created)
  const response = await handleCreatePrediction(
    `Bearer ${created.playerId}.${created.accessToken}`,
    JSON.stringify({ direction: 'UP', idempotencyKey: '11111111-1111-4111-8111-111111111111' }),
    'create',
    { players: store, predictions: store, now: () => createdAt, quote: async () => entry },
  )
  const prediction = JSON.parse(response.body ?? '') as { predictionId: string; dueAt: string; playerId: string }
  return { store, created, prediction }
}

function input(prediction: { playerId: string; predictionId: string; dueAt: string }) {
  return { playerId: prediction.playerId, predictionId: prediction.predictionId, dueAt: prediction.dueAt }
}

describe('resolvePrediction', () => {
  it('does not fetch a quote before the deadline', async () => {
    const { store, prediction } = await pendingRound()
    let calls = 0
    const result = await handleResolvePrediction(input(prediction), {
      predictions: store,
      players: store,
      now: () => createdAt,
      quote: async () => {
        calls += 1
        return moved('84000.00')
      },
    })
    expect(result.status).toBe('TOO_EARLY')
    expect(calls).toBe(0)
    expect((await store.get(prediction.playerId))?.score).toBe(0)
  })

  it('settles once and ignores a second call', async () => {
    const { store, prediction } = await pendingRound()
    const deps = {
      predictions: store,
      players: store,
      now: () => new Date('2026-10-11T15:01:03.000Z'),
      quote: async () => moved('84000.00'),
    }
    const first = await handleResolvePrediction(input(prediction), deps)
    const second = await handleResolvePrediction(input(prediction), deps)
    expect(first.status).toBe('SETTLED')
    expect(second.status).toBe('ALREADY_SETTLED')
    const player = await store.get(prediction.playerId)
    expect(player).toMatchObject({ score: 1, wins: 1, losses: 0, latestResolvedPredictionId: prediction.predictionId })
    expect(player?.activePredictionId).toBeUndefined()
  })

  it('changes the score once when two calls overlap', async () => {
    const { store, prediction } = await pendingRound()
    const deps = {
      predictions: store,
      players: store,
      now: () => new Date('2026-10-11T15:01:03.000Z'),
      quote: async () => moved('82000.00'),
    }
    const [left, right] = await Promise.all([
      handleResolvePrediction(input(prediction), deps),
      handleResolvePrediction(input(prediction), deps),
    ])
    expect([left.status, right.status].sort()).toEqual(['ALREADY_SETTLED', 'SETTLED'])
    expect((await store.get(prediction.playerId))?.score).toBe(-1)
  })

  it('records a hold without scoring', async () => {
    const { store, prediction } = await pendingRound()
    const equal = await handleResolvePrediction(input(prediction), {
      predictions: store,
      players: store,
      now: () => new Date('2026-10-11T15:01:03.000Z'),
      quote: async () => moved(entry.price),
    })
    expect(equal.status).toBe('EQUAL_PRICE')
    const held = await handleResolvePrediction(input(prediction), {
      predictions: store,
      players: store,
      now: () => new Date('2026-10-11T15:01:04.000Z'),
      quote: async () => {
        throw new ProviderUnavailableError('network')
      },
    })
    expect(held.status).toBe('PROVIDER_HOLD')
    expect((await store.get(prediction.playerId))?.score).toBe(0)
    expect((await store.getPrediction(prediction.playerId, prediction.predictionId))?.status).toBe('PENDING')
  })

  it('drops an orphan from the scanner without scoring', async () => {
    const { store, prediction } = await pendingRound()
    const player = await store.get(prediction.playerId)
    delete player?.activePredictionId
    const result = await handleResolvePrediction(input(prediction), {
      predictions: store,
      players: store,
      now: () => new Date('2026-10-11T15:01:03.000Z'),
      quote: async () => moved('84000.00'),
    })
    expect(result.status).toBe('ORPHANED')
    expect((await store.get(prediction.playerId))?.score).toBe(0)
    expect((await store.getPrediction(prediction.playerId, prediction.predictionId))?.pendingKey).toBeUndefined()
  })

  it('leaves the round pending when the settlement write throws', async () => {
    const { store, prediction } = await pendingRound()
    store.failNextSettle()
    await expect(
      handleResolvePrediction(input(prediction), {
        predictions: store,
        players: store,
        now: () => new Date('2026-10-11T15:01:03.000Z'),
        quote: async () => moved('84000.00'),
      }),
    ).rejects.toThrow('settle failed')
    expect((await store.get(prediction.playerId))?.score).toBe(0)
    expect((await store.getPrediction(prediction.playerId, prediction.predictionId))?.status).toBe('PENDING')
  })
})
