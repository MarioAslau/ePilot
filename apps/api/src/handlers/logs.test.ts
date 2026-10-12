import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TickerQuote } from '../coinbase.js'
import { memoryGameStore } from '../memoryStore.js'
import { createPlayer, hashToken } from '../player.js'
import { handleCreatePlayer } from './createPlayer.js'
import { handleCreatePrediction } from './createPrediction.js'
import { handleMe } from './me.js'
import { handleRecoverStuckPredictions } from './recoverStuckPredictions.js'
import { handleResolvePrediction } from './resolvePrediction.js'

const now = new Date('2026-10-11T15:00:00.000Z')
const quote: TickerQuote = {
  price: '84000.00',
  tradeTime: '2026-10-11T14:59:58.000Z',
  fetchedAt: now.toISOString(),
}

describe('lifecycle logs', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the access token and its hash out of the logs', async () => {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      lines.push(String(line))
    })
    const store = memoryGameStore()
    const created = createPlayer(now, (size) => Buffer.alloc(size, 7))
    await store.putNew(created)
    const minted = await handleCreatePlayer('create-player', {
      players: store,
      now: () => now,
      nextBytes: (size) => Buffer.alloc(size, 8),
    })
    const mintedBody = JSON.parse(minted.body ?? '') as { accessToken: string }
    const header = `Bearer ${created.playerId}.${created.accessToken}`
    await handleMe(header, 'me', { players: store, predictions: store, now: () => now })
    const response = await handleCreatePrediction(
      header,
      JSON.stringify({ direction: 'UP', idempotencyKey: '77777777-7777-4777-8777-777777777777' }),
      'create',
      {
        players: store,
        predictions: store,
        now: () => now,
        quote: async () => quote,
        nextBytes: (size) => Buffer.alloc(size, 9),
      },
    )
    const prediction = JSON.parse(response.body ?? '') as { predictionId: string; dueAt: string; playerId: string }
    const createdLog = lines
      .map((line) => JSON.parse(line) as { event?: string; executionName?: string })
      .find((row) => row.event === 'prediction.created')
    expect(createdLog?.executionName).toBe(`prediction-${prediction.predictionId}`)
    await handleRecoverStuckPredictions({
      now: () => new Date('2026-10-11T15:10:00.000Z'),
      listOverdue: (before) => store.listOverdue(before),
      describe: async () => 'MISSING',
      start: async () => undefined,
    })
    await handleResolvePrediction(prediction, {
      predictions: store,
      players: store,
      now: () => new Date('2026-10-11T15:10:00.000Z'),
      quote: async () => ({ ...quote, tradeTime: '2026-10-11T15:09:55.000Z' }),
    })

    const output = lines.join('\n')
    for (const secret of [created.accessToken, created.accessTokenHash, hashToken(created.accessToken), mintedBody.accessToken, hashToken(mintedBody.accessToken)]) {
      expect(output).not.toContain(secret)
    }
  })

  it('marks a later round as repeat play', async () => {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      lines.push(String(line))
    })
    const store = memoryGameStore()
    const created = createPlayer(now, (size) => Buffer.alloc(size, 3))
    await store.putNew(created)
    const header = `Bearer ${created.playerId}.${created.accessToken}`
    const deps = {
      players: store,
      predictions: store,
      now: () => now,
      quote: async () => quote,
    }
    const first = await handleCreatePrediction(
      header,
      JSON.stringify({ direction: 'UP', idempotencyKey: '88888888-8888-4888-8888-888888888888' }),
      'first-round',
      deps,
    )
    const firstBody = JSON.parse(first.body ?? '') as { predictionId: string }
    await store.settle({
      playerId: created.playerId,
      predictionId: firstBody.predictionId,
      outcome: 'WIN',
      scoreDelta: 1,
      resolutionPrice: '85000.00',
      resolutionTradeTime: '2026-10-11T15:01:02.000Z',
      resolutionFetchedAt: '2026-10-11T15:01:03.000Z',
      resolvedAt: '2026-10-11T15:01:03.000Z',
    })
    await handleCreatePrediction(
      header,
      JSON.stringify({ direction: 'DOWN', idempotencyKey: '99999999-9999-4999-8999-999999999999' }),
      'second-round',
      {
        ...deps,
        now: () => new Date('2026-10-11T15:02:00.000Z'),
        quote: async () => ({
          ...quote,
          tradeTime: '2026-10-11T15:01:58.000Z',
          fetchedAt: '2026-10-11T15:02:00.000Z',
        }),
      },
    )
    await handleCreatePrediction(
      header,
      JSON.stringify({ direction: 'DOWN', idempotencyKey: '99999999-9999-4999-8999-999999999999' }),
      'replay',
      {
        ...deps,
        now: () => new Date('2026-10-11T15:02:00.000Z'),
        quote: async () => ({
          ...quote,
          tradeTime: '2026-10-11T15:01:58.000Z',
          fetchedAt: '2026-10-11T15:02:00.000Z',
        }),
      },
    )
    const createdLogs = lines
      .map((line) => JSON.parse(line) as { event?: string; repeat?: string; priorRounds?: string })
      .filter((row) => row.event === 'prediction.created')
    expect(createdLogs).toEqual([
      expect.objectContaining({ repeat: 'false', priorRounds: '0' }),
      expect.objectContaining({ repeat: 'true', priorRounds: '1' }),
    ])
    expect(lines.join('\n')).not.toContain(created.accessToken)
  })
})
