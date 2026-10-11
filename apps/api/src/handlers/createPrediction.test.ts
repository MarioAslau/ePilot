import { createPlayer } from '../player.js'
import { memoryGameStore } from '../memoryStore.js'
import type { TickerQuote } from '../coinbase.js'
import { ProviderUnavailableError } from '../coinbase.js'
import { handleCreatePrediction } from './createPrediction.js'
import { handleMe } from './me.js'
import { describe, expect, it } from 'vitest'

const now = new Date('2026-10-11T15:00:00.000Z')
const quote: TickerQuote = {
  price: '83062.64',
  tradeTime: '2026-10-11T14:59:58.000Z',
  fetchedAt: now.toISOString(),
  source: 'COINBASE_EXCHANGE',
}

function session() {
  const created = createPlayer(now, (size) => Buffer.alloc(size, 7))
  return created
}

async function readyStore() {
  const store = memoryGameStore()
  const created = session()
  await store.putNew(created)
  return { store, created }
}

function body(direction: 'UP' | 'DOWN', key: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ direction, idempotencyKey: key, ...extra })
}

function header(created: ReturnType<typeof createPlayer>) {
  return `Bearer ${created.playerId}.${created.accessToken}`
}

describe('POST /predictions', () => {
  it('records the server price and ignores client prices', async () => {
    const { store, created } = await readyStore()
    const response = await handleCreatePrediction(
      header(created),
      body('UP', '11111111-1111-4111-8111-111111111111', {
        entryPrice: '1.00',
        createdAt: '2020-01-01T00:00:00.000Z',
        score: 99,
      }),
      'req-1',
      { players: store, predictions: store, now: () => now, quote: async () => quote },
    )
    expect(response.statusCode).toBe(201)
    const parsed = JSON.parse(response.body ?? '')
    expect(parsed).toMatchObject({
      direction: 'UP',
      mode: 'STANDARD',
      status: 'PENDING',
      entryPrice: '83062.64',
      entryTradeTime: quote.tradeTime,
      createdAt: now.toISOString(),
      dueAt: '2026-10-11T15:01:00.000Z',
    })
    expect(parsed.entryPrice).not.toBe('1.00')
    const saved = await store.get(created.playerId)
    expect(saved?.activePredictionId).toBe(parsed.predictionId)
  })

  it('replays the same key and direction without a second quote', async () => {
    const { store, created } = await readyStore()
    let calls = 0
    const deps = {
      players: store,
      predictions: store,
      now: () => now,
      quote: async () => {
        calls += 1
        return quote
      },
    }
    const first = await handleCreatePrediction(
      header(created),
      body('DOWN', '22222222-2222-4222-8222-222222222222'),
      'req-2',
      deps,
    )
    const second = await handleCreatePrediction(
      header(created),
      body('DOWN', '22222222-2222-4222-8222-222222222222'),
      'req-3',
      deps,
    )
    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(200)
    expect(JSON.parse(second.body ?? '')).toEqual(JSON.parse(first.body ?? ''))
    expect(calls).toBe(1)
  })

  it('rejects the same key with a different direction', async () => {
    const { store, created } = await readyStore()
    const key = '33333333-3333-4333-8333-333333333333'
    await handleCreatePrediction(header(created), body('UP', key), 'req-4', {
      players: store,
      predictions: store,
      now: () => now,
      quote: async () => quote,
    })
    const conflict = await handleCreatePrediction(header(created), body('DOWN', key), 'req-5', {
      players: store,
      predictions: store,
      now: () => now,
      quote: async () => quote,
    })
    expect(conflict.statusCode).toBe(409)
    expect(JSON.parse(conflict.body ?? '').code).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('rejects a second key while a round is active without calling the provider', async () => {
    const { store, created } = await readyStore()
    let calls = 0
    const deps = {
      players: store,
      predictions: store,
      now: () => now,
      quote: async () => {
        calls += 1
        return quote
      },
    }
    await handleCreatePrediction(
      header(created),
      body('UP', '44444444-4444-4444-8444-444444444444'),
      'req-6',
      deps,
    )
    const blocked = await handleCreatePrediction(
      header(created),
      body('DOWN', '55555555-5555-4555-8555-555555555555'),
      'req-7',
      deps,
    )
    expect(blocked.statusCode).toBe(409)
    expect(JSON.parse(blocked.body ?? '').code).toBe('ACTIVE_ROUND')
    expect(calls).toBe(1)
  })

  it('writes nothing when the provider fails or the trade is stale', async () => {
    const failed = await readyStore()
    const down = await handleCreatePrediction(
      header(failed.created),
      body('UP', '66666666-6666-4666-8666-666666666666'),
      'req-8',
      {
        players: failed.store,
        predictions: failed.store,
        now: () => now,
        quote: async () => {
          throw new ProviderUnavailableError('network')
        },
      },
    )
    expect(down.statusCode).toBe(503)
    expect((await failed.store.get(failed.created.playerId))?.activePredictionId).toBeUndefined()

    const stale = await readyStore()
    const old = await handleCreatePrediction(
      header(stale.created),
      body('UP', '77777777-7777-4777-8777-777777777777'),
      'req-9',
      {
        players: stale.store,
        predictions: stale.store,
        now: () => now,
        quote: async () => ({ ...quote, tradeTime: '2026-10-11T14:59:40.000Z' }),
      },
    )
    expect(old.statusCode).toBe(503)
    expect((await stale.store.get(stale.created.playerId))?.activePredictionId).toBeUndefined()
  })

  it('rejects a bad token and a bad body', async () => {
    const { store, created } = await readyStore()
    const auth = await handleCreatePrediction(
      'Bearer anon_07070707.not-a-token',
      body('UP', '88888888-8888-4888-8888-888888888888'),
      'req-10',
      { players: store, predictions: store, quote: async () => quote },
    )
    const input = await handleCreatePrediction(header(created), '{', 'req-11', {
      players: store,
      predictions: store,
      quote: async () => quote,
    })
    expect(auth.statusCode).toBe(401)
    expect(input.statusCode).toBe(400)
  })

  it('lets only one of two simultaneous keys win', async () => {
    const { store, created } = await readyStore()
    let calls = 0
    const deps = {
      players: store,
      predictions: store,
      now: () => now,
      quote: async () => {
        calls += 1
        return quote
      },
    }
    const [left, right] = await Promise.all([
      handleCreatePrediction(
        header(created),
        body('UP', '99999999-9999-4999-8999-999999999999'),
        'req-12',
        deps,
      ),
      handleCreatePrediction(
        header(created),
        body('DOWN', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
        'req-13',
        deps,
      ),
    ])
    const statuses = [left.statusCode, right.statusCode].sort()
    expect(statuses).toEqual([201, 409])
    expect(calls).toBe(2)
  })

  it('returns the same prediction when the same key races', async () => {
    const { store, created } = await readyStore()
    const key = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    const [left, right] = await Promise.all([
      handleCreatePrediction(header(created), body('UP', key), 'req-14', {
        players: store,
        predictions: store,
        now: () => now,
        quote: async () => quote,
      }),
      handleCreatePrediction(header(created), body('UP', key), 'req-15', {
        players: store,
        predictions: store,
        now: () => now,
        quote: async () => quote,
      }),
    ])
    expect(JSON.parse(left.body ?? '').predictionId).toBe(JSON.parse(right.body ?? '').predictionId)
    expect([left.statusCode, right.statusCode].sort()).toEqual([200, 201])
  })
})

describe('GET /me active prediction', () => {
  it('reports waiting before the deadline and checking after it', async () => {
    const { store, created } = await readyStore()
    await handleCreatePrediction(
      header(created),
      body('UP', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
      'req-16',
      { players: store, predictions: store, now: () => now, quote: async () => quote },
    )
    const waiting = await handleMe(header(created), 'req-17', {
      store,
      predictions: store,
      now: () => new Date('2026-10-11T15:00:30.000Z'),
    })
    const checking = await handleMe(header(created), 'req-18', {
      store,
      predictions: store,
      now: () => new Date('2026-10-11T15:01:00.000Z'),
    })
    expect(JSON.parse(waiting.body ?? '').waitReason).toBe('WAITING_FOR_DEADLINE')
    expect(JSON.parse(checking.body ?? '').waitReason).toBe('CHECKING_PRICE')
    expect(JSON.parse(checking.body ?? '').latestResolvedPrediction).toBeNull()
  })
})
