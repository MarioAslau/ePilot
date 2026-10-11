import { afterEach, describe, expect, it, vi } from 'vitest'
import { PredictionHistoryResponseSchema } from 'contracts'
import { memoryGameStore } from '../memoryStore.js'
import { createPlayer } from '../player.js'
import { buildPrediction } from '../prediction.js'
import { encodeHistoryCursor, handleGetPredictionHistory } from './getPredictionHistory.js'

const start = new Date('2026-10-11T15:00:00.000Z')

function header(player: { playerId: string; accessToken: string }) {
  return `Bearer ${player.playerId}.${player.accessToken}`
}

function key(n: number) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

async function openPlayer(byte: number) {
  const store = memoryGameStore()
  const created = createPlayer(start, (size) => Buffer.alloc(size, byte))
  await store.putNew(created)
  return { store, created }
}

async function settleRound(
  store: ReturnType<typeof memoryGameStore>,
  playerId: string,
  at: Date,
  n: number,
  outcome: 'WIN' | 'LOSS' = 'WIN',
) {
  const built = buildPrediction({
    now: at,
    playerId,
    direction: outcome === 'WIN' ? 'UP' : 'DOWN',
    idempotencyKey: key(n),
    entryPrice: '100.10',
    entryTradeTime: at.toISOString(),
    entryFetchedAt: at.toISOString(),
    nextBytes: (size) => Buffer.alloc(size, n),
  })
  expect(await store.create(built)).toBe('created')
  const resolvedAt = new Date(at.getTime() + 62_000).toISOString()
  expect(
    await store.settle({
      playerId,
      predictionId: built.prediction.predictionId,
      outcome,
      scoreDelta: outcome === 'WIN' ? 1 : -1,
      resolutionPrice: outcome === 'WIN' ? '101.20' : '99.00',
      resolutionTradeTime: resolvedAt,
      resolutionFetchedAt: resolvedAt,
      resolvedAt,
    }),
  ).toBe('settled')
  return built.prediction.predictionId
}

describe('GET /predictions', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects a missing or wrong token', async () => {
    const { store, created } = await openPlayer(4)
    const missing = await handleGetPredictionHistory(undefined, undefined, 'missing', {
      players: store,
      predictions: store,
    })
    expect(missing.statusCode).toBe(401)
    const wrong = await handleGetPredictionHistory(
      `Bearer ${created.playerId}.${'ab'.repeat(32)}`,
      undefined,
      'wrong',
      { players: store, predictions: store },
    )
    expect(wrong.statusCode).toBe(401)
  })

  it('returns an empty page and logs no token', async () => {
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      lines.push(String(line))
    })
    const { store, created } = await openPlayer(5)
    const response = await handleGetPredictionHistory(header(created), undefined, 'empty', {
      players: store,
      predictions: store,
    })
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body ?? '')).toEqual({ predictions: [], nextCursor: null })
    const output = lines.join('\n')
    expect(output).toContain('"event":"history.listed"')
    expect(output).not.toContain(created.accessToken)
    expect(output).not.toContain(created.accessTokenHash)
  })

  it('returns settled rounds newest first and leaves out the pending round', async () => {
    const { store, created } = await openPlayer(6)
    const older = await settleRound(store, created.playerId, start, 1)
    const newer = await settleRound(store, created.playerId, new Date(start.getTime() + 1_000), 2, 'LOSS')
    const pending = buildPrediction({
      now: new Date(start.getTime() + 2_000),
      playerId: created.playerId,
      direction: 'UP',
      idempotencyKey: key(3),
      entryPrice: '100.10',
      entryTradeTime: start.toISOString(),
      entryFetchedAt: start.toISOString(),
      nextBytes: (size) => Buffer.alloc(size, 3),
    })
    expect(await store.create(pending)).toBe('created')

    const response = await handleGetPredictionHistory(header(created), { limit: '20' }, 'list', {
      players: store,
      predictions: store,
    })
    const body = PredictionHistoryResponseSchema.parse(JSON.parse(response.body ?? ''))
    expect(body.predictions.map((row) => row.predictionId)).toEqual([newer, older])
    expect(body.predictions.map((row) => row.predictionId)).not.toContain(pending.prediction.predictionId)
    expect(body.nextCursor).toBeNull()
    expect(body.predictions[0]).toMatchObject({ outcome: 'LOSS', scoreDelta: -1, status: 'RESOLVED' })
  })

  it('pages without gaps or duplicates', async () => {
    const { store, created } = await openPlayer(7)
    const ids: string[] = []
    for (let index = 0; index < 5; index += 1) {
      ids.push(
        await settleRound(store, created.playerId, new Date(start.getTime() + index * 1_000), index + 1),
      )
    }
    const seen: string[] = []
    let cursor: string | undefined
    const pageSizes: number[] = []
    for (let page = 0; page < 4; page += 1) {
      const response = await handleGetPredictionHistory(
        header(created),
        { limit: '2', ...(cursor ? { cursor } : {}) },
        `page-${page}`,
        { players: store, predictions: store },
      )
      const body = PredictionHistoryResponseSchema.parse(JSON.parse(response.body ?? ''))
      pageSizes.push(body.predictions.length)
      seen.push(...body.predictions.map((row) => row.predictionId))
      if (!body.nextCursor) break
      cursor = body.nextCursor
    }
    expect(pageSizes).toEqual([2, 2, 1])
    expect(seen).toEqual([...ids].reverse())
    expect(new Set(seen).size).toBe(5)
  })

  it('keeps another player on their own partition', async () => {
    const first = await openPlayer(8)
    const secondStore = first.store
    const other = createPlayer(start, (size) => Buffer.alloc(size, 9))
    await secondStore.putNew(other)
    const hidden = await settleRound(first.store, first.created.playerId, new Date(start.getTime() + 5_000), 11)
    await settleRound(first.store, first.created.playerId, new Date(start.getTime() + 6_000), 12)
    const visible = await settleRound(first.store, other.playerId, start, 13, 'LOSS')
    const firstPage = await handleGetPredictionHistory(header(first.created), { limit: '1' }, 'owner', {
      players: first.store,
      predictions: first.store,
    })
    const cursor = PredictionHistoryResponseSchema.parse(JSON.parse(firstPage.body ?? '')).nextCursor
    expect(cursor).toEqual(expect.any(String))

    const crossed = await handleGetPredictionHistory(header(other), { cursor: cursor ?? '' }, 'other', {
      players: first.store,
      predictions: first.store,
    })
    const body = PredictionHistoryResponseSchema.parse(JSON.parse(crossed.body ?? ''))
    expect(body.predictions.map((row) => row.predictionId)).toEqual([visible])
    expect(body.predictions.map((row) => row.predictionId)).not.toContain(hidden)
    expect(body.predictions.every((row) => row.playerId === other.playerId)).toBe(true)
  })

  it('rejects a cursor that is not a prediction sort key', async () => {
    const { store, created } = await openPlayer(10)
    for (const cursor of [
      encodeHistoryCursor(`PLAYER#${created.playerId}`),
      encodeHistoryCursor('PREDICTION#nope'),
      '%%%',
    ]) {
      const response = await handleGetPredictionHistory(header(created), { cursor }, 'bad-cursor', {
        players: store,
        predictions: store,
      })
      expect(response.statusCode).toBe(400)
    }
  })

  it('rejects a limit outside 1 to 50 and defaults to 20', async () => {
    const { store, created } = await openPlayer(11)
    for (const limit of ['0', '51', 'nope']) {
      const response = await handleGetPredictionHistory(header(created), { limit }, 'bad-limit', {
        players: store,
        predictions: store,
      })
      expect(response.statusCode).toBe(400)
    }
    const ids: string[] = []
    for (let index = 0; index < 21; index += 1) {
      ids.push(
        await settleRound(store, created.playerId, new Date(start.getTime() + index * 1_000), index + 1),
      )
    }
    const response = await handleGetPredictionHistory(header(created), undefined, 'default', {
      players: store,
      predictions: store,
    })
    const body = PredictionHistoryResponseSchema.parse(JSON.parse(response.body ?? ''))
    expect(body.predictions).toHaveLength(20)
    expect(body.nextCursor).toEqual(expect.any(String))
    expect(body.predictions[0]?.predictionId).toBe(ids[20])
  })
})
