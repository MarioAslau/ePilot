import { createPlayer } from '../player.js'
import { memoryGameStore } from '../memoryStore.js'
import type { TickerQuote } from '../coinbase.js'
import { handleCreatePrediction } from './createPrediction.js'
import { handleResolvePrediction } from './resolvePrediction.js'
import { handleRecoverStuckPredictions, type ExecutionState } from './recoverStuckPredictions.js'
import { describe, expect, it } from 'vitest'

const createdAt = new Date('2026-10-11T15:00:00.000Z')
const quote: TickerQuote = {
  price: '83062.64',
  tradeTime: '2026-10-11T14:59:58.000Z',
  fetchedAt: createdAt.toISOString(),
  source: 'COINBASE_EXCHANGE',
}

async function oldRound() {
  const store = memoryGameStore()
  const created = createPlayer(createdAt, (size) => Buffer.alloc(size, 3))
  await store.putNew(created)
  const response = await handleCreatePrediction(
    `Bearer ${created.playerId}.${created.accessToken}`,
    JSON.stringify({ direction: 'DOWN', idempotencyKey: '22222222-2222-4222-8222-222222222222' }),
    'create',
    { players: store, predictions: store, now: () => createdAt, quote: async () => quote },
  )
  const prediction = JSON.parse(response.body ?? '') as { predictionId: string; dueAt: string; playerId: string }
  return { store, prediction }
}

describe('recoverStuckPredictions', () => {
  it('starts a missing execution with the base name', async () => {
    const { store, prediction } = await oldRound()
    const started: string[] = []
    const result = await handleRecoverStuckPredictions({
      now: () => new Date('2026-10-11T15:10:00.000Z'),
      listOverdue: (before) => store.listOverdue(before),
      describe: async () => 'MISSING',
      start: async (name) => {
        started.push(name)
      },
    })
    expect(result.started).toBe(1)
    expect(started).toEqual([`prediction-${prediction.predictionId}`])
  })

  it('skips a running execution and restarts a failed one under a new name', async () => {
    const { store, prediction } = await oldRound()
    const started: string[] = []
    const describe = async (): Promise<ExecutionState> => 'RUNNING'
    await handleRecoverStuckPredictions({
      now: () => new Date('2026-10-11T15:10:00.000Z'),
      listOverdue: (before) => store.listOverdue(before),
      describe,
      start: async (name) => {
        started.push(name)
      },
    })
    expect(started).toEqual([])

    await handleRecoverStuckPredictions({
      now: () => new Date('2026-10-11T15:10:00.000Z'),
      listOverdue: (before) => store.listOverdue(before),
      describe: async () => 'FAILED',
      start: async (name) => {
        started.push(name)
      },
    })
    const restartedAt = new Date('2026-10-11T15:10:00.000Z')
    expect(started).toEqual([
      `prediction-${prediction.predictionId}-r${Math.floor(restartedAt.getTime() / 60_000)}`,
    ])
  })

  it('does not list a round that is not two minutes overdue', async () => {
    const { store } = await oldRound()
    const result = await handleRecoverStuckPredictions({
      now: () => new Date('2026-10-11T15:01:30.000Z'),
      listOverdue: (before) => store.listOverdue(before),
      describe: async () => 'MISSING',
      start: async () => {
        throw new Error('should not start')
      },
    })
    expect(result).toEqual({ found: 0, started: 0 })
  })

  it('does not score twice when recovery and resolve both run', async () => {
    const { store, prediction } = await oldRound()
    await handleRecoverStuckPredictions({
      now: () => new Date('2026-10-11T15:10:00.000Z'),
      listOverdue: (before) => store.listOverdue(before),
      describe: async () => 'MISSING',
      start: async () => undefined,
    })
    const deps = {
      predictions: store,
      players: store,
      now: () => new Date('2026-10-11T15:10:00.000Z'),
      quote: async () => ({ ...quote, price: '82000.00', tradeTime: '2026-10-11T15:09:55.000Z' }),
    }
    await handleResolvePrediction(prediction, deps)
    await handleResolvePrediction(prediction, deps)
    expect((await store.get(prediction.playerId))?.score).toBe(1)
  })
})
