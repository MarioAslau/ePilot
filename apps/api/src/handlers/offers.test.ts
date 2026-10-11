import { createPlayer } from '../player.js'
import { memoryGameStore } from '../memoryStore.js'
import type { TickerQuote } from '../coinbase.js'
import { ProviderUnavailableError } from '../coinbase.js'
import { offerIdFor } from '../offer.js'
import { handleCreatePrediction } from './createPrediction.js'
import { handleAcceptOffer } from './acceptOffer.js'
import { handleDeclineOffer } from './declineOffer.js'
import { handleExtendOffer } from './extendOffer.js'
import { handleMe } from './me.js'
import { handleResolvePrediction } from './resolvePrediction.js'
import { describe, expect, it, vi } from 'vitest'

const createdAt = new Date('2026-10-11T15:00:00.000Z')
const resolvedAt = new Date('2026-10-11T15:01:03.000Z')
const entry: TickerQuote = {
  price: '83062.64',
  tradeTime: '2026-10-11T14:59:58.000Z',
  fetchedAt: createdAt.toISOString(),
  source: 'COINBASE_EXCHANGE',
}

function quoteAt(price: string, at: Date): TickerQuote {
  const trade = new Date(at.getTime() - 1_000)
  return { price, tradeTime: trade.toISOString(), fetchedAt: at.toISOString(), source: 'COINBASE_EXCHANGE' }
}

function header(created: { playerId: string; accessToken: string }) {
  return `Bearer ${created.playerId}.${created.accessToken}`
}

async function wonStandard(byte = 7) {
  const store = memoryGameStore()
  const created = createPlayer(createdAt, (size) => Buffer.alloc(size, byte))
  await store.putNew(created)
  const response = await handleCreatePrediction(
    header(created),
    JSON.stringify({ direction: 'UP', idempotencyKey: '11111111-1111-4111-8111-111111111111' }),
    'create',
    { players: store, predictions: store, now: () => createdAt, quote: async () => entry },
  )
  const prediction = JSON.parse(response.body ?? '') as { predictionId: string; dueAt: string; playerId: string }
  await handleResolvePrediction(
    { playerId: prediction.playerId, predictionId: prediction.predictionId, dueAt: prediction.dueAt },
    {
      predictions: store,
      players: store,
      now: () => resolvedAt,
      quote: async () => quoteAt('84000.00', resolvedAt),
      doubleDown: true,
    },
  )
  const player = await store.get(created.playerId)
  return { store, created, prediction, offerId: player?.openOfferId ?? '' }
}

const on = { doubleDown: true }

describe('Double Down settlement', () => {
  it('opens one offer on a standard win and does not chain a bonus win', async () => {
    const { store, created, prediction, offerId } = await wonStandard()
    expect(offerId).toBe(offerIdFor(prediction.predictionId))
    const offer = await store.getOffer(created.playerId, offerId)
    expect(offer).toMatchObject({ status: 'OPEN', extensions: 0, issuedAt: resolvedAt.toISOString() })
    expect(offer?.expiresAt).toBe('2026-10-11T15:01:13.000Z')
    const player = await store.get(created.playerId)
    expect(player).toMatchObject({ openOfferId: offerId, latestOfferId: offerId, score: 1, wins: 1 })

    await handleResolvePrediction(
      { playerId: prediction.playerId, predictionId: prediction.predictionId, dueAt: prediction.dueAt },
      { predictions: store, players: store, now: () => resolvedAt, quote: async () => quoteAt('84000.00', resolvedAt), doubleDown: true },
    )
    expect((await store.get(created.playerId))?.score).toBe(1)
    expect(await store.getOffer(created.playerId, offerId)).toMatchObject({ status: 'OPEN' })
  })

  it('skips the offer on a loss, when the flag is off, and after a bonus win', async () => {
    const store = memoryGameStore()
    const created = createPlayer(createdAt, (size) => Buffer.alloc(size, 4))
    await store.putNew(created)
    const response = await handleCreatePrediction(
      header(created),
      JSON.stringify({ direction: 'UP', idempotencyKey: '22222222-2222-4222-8222-222222222222' }),
      'create',
      { players: store, predictions: store, now: () => createdAt, quote: async () => entry },
    )
    const prediction = JSON.parse(response.body ?? '') as { predictionId: string; dueAt: string; playerId: string }
    await handleResolvePrediction(
      { playerId: prediction.playerId, predictionId: prediction.predictionId, dueAt: prediction.dueAt },
      { predictions: store, players: store, now: () => resolvedAt, quote: async () => quoteAt('82000.00', resolvedAt), doubleDown: true },
    )
    expect((await store.get(created.playerId))?.openOfferId).toBeUndefined()

    const { store: flagged, created: flaggedPlayer } = await wonStandard(5)
    const off = await handleMe(header(flaggedPlayer), 'me', { store: flagged, predictions: flagged, now: () => resolvedAt, doubleDown: false })
    expect(JSON.parse(off.body ?? '').features.doubleDown).toBe(false)
    expect(JSON.parse(off.body ?? '').offer).toBeNull()

    const bonusGame = await wonStandard(6)
    const acceptAt = new Date('2026-10-11T15:01:05.000Z')
    const accepted = await handleAcceptOffer(
      header(bonusGame.created),
      bonusGame.offerId,
      JSON.stringify({ idempotencyKey: '66666666-6666-4666-8666-666666666666' }),
      'bonus',
      { ...on, players: bonusGame.store, predictions: bonusGame.store, now: () => acceptAt, quote: async () => quoteAt('84100.00', acceptAt), startWorkflow: async () => undefined },
    )
    const bonus = JSON.parse(accepted.body ?? '') as { predictionId: string; dueAt: string; playerId: string }
    const bonusResolved = new Date('2026-10-11T15:02:06.000Z')
    await handleResolvePrediction(
      { playerId: bonus.playerId, predictionId: bonus.predictionId, dueAt: bonus.dueAt },
      { predictions: bonusGame.store, players: bonusGame.store, now: () => bonusResolved, quote: async () => quoteAt('85000.00', bonusResolved), doubleDown: true },
    )
    expect(await bonusGame.store.getOffer(bonusGame.created.playerId, offerIdFor(bonus.predictionId))).toBeNull()
    expect((await bonusGame.store.get(bonusGame.created.playerId))?.score).toBe(3)
    expect((await bonusGame.store.get(bonusGame.created.playerId))?.openOfferId).toBeUndefined()
  })
})

describe('POST /offers', () => {
  it('starts a bonus round in the parent direction and ignores a client direction', async () => {
    const { store, created, offerId } = await wonStandard()
    const started: string[] = []
    const acceptAt = new Date('2026-10-11T15:01:05.000Z')
    const response = await handleAcceptOffer(
      header(created),
      offerId,
      JSON.stringify({ idempotencyKey: '33333333-3333-4333-8333-333333333333', direction: 'DOWN' }),
      'accept',
      {
        players: store,
        predictions: store,
        now: () => acceptAt,
        quote: async () => quoteAt('84100.00', acceptAt),
        doubleDown: true,
        startWorkflow: async (input) => {
          started.push(input.predictionId)
        },
      },
    )
    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body ?? '')
    expect(body).toMatchObject({
      mode: 'DOUBLE_DOWN',
      direction: 'UP',
      parentPredictionId: offerId.slice(2),
      dueAt: '2026-10-11T15:02:05.000Z',
      entryPrice: '84100.00',
    })
    expect(started).toEqual([body.predictionId])
    expect((await store.getOffer(created.playerId, offerId))?.status).toBe('ACCEPTED')
    const again = await handleAcceptOffer(
      header(created),
      offerId,
      JSON.stringify({ idempotencyKey: '33333333-3333-4333-8333-333333333333' }),
      'replay',
      { players: store, predictions: store, now: () => acceptAt, quote: async () => quoteAt('84100.00', acceptAt), ...on },
    )
    expect(again.statusCode).toBe(200)
    expect(JSON.parse(again.body ?? '').predictionId).toBe(body.predictionId)
    expect(started).toHaveLength(1)
  })

  it('rejects an offer at the exact deadline and keeps it open when the price source fails', async () => {
    const { store, created, offerId } = await wonStandard()
    const expired = await handleAcceptOffer(
      header(created),
      offerId,
      JSON.stringify({ idempotencyKey: '44444444-4444-4444-8444-444444444444' }),
      'late',
      {
        players: store,
        predictions: store,
        now: () => new Date('2026-10-11T15:01:13.000Z'),
        quote: async () => quoteAt('84100.00', new Date('2026-10-11T15:01:13.000Z')),
        ...on,
      },
    )
    expect(expired.statusCode).toBe(409)
    expect(JSON.parse(expired.body ?? '').code).toBe('OFFER_EXPIRED')
    expect((await store.get(created.playerId))?.activePredictionId).toBeUndefined()

    const down = await handleAcceptOffer(
      header(created),
      offerId,
      JSON.stringify({ idempotencyKey: '55555555-5555-4555-8555-555555555555' }),
      'down',
      {
        players: store,
        predictions: store,
        now: () => new Date('2026-10-11T15:01:05.000Z'),
        quote: async () => {
          throw new ProviderUnavailableError('network')
        },
        ...on,
      },
    )
    expect(down.statusCode).toBe(503)
    expect((await store.getOffer(created.playerId, offerId))?.status).toBe('OPEN')
  })

  it('lets one of two accepts win', async () => {
    const { store, created, offerId } = await wonStandard()
    const acceptAt = new Date('2026-10-11T15:01:05.000Z')
    const deps = {
      players: store,
      predictions: store,
      now: () => acceptAt,
      quote: async () => quoteAt('84100.00', acceptAt),
      ...on,
    }
    const [left, right] = await Promise.all([
      handleAcceptOffer(header(created), offerId, JSON.stringify({ idempotencyKey: '66666666-6666-4666-8666-666666666666' }), 'a', deps),
      handleAcceptOffer(header(created), offerId, JSON.stringify({ idempotencyKey: '77777777-7777-4777-8777-777777777777' }), 'b', deps),
    ])
    expect([left.statusCode, right.statusCode].sort()).toEqual([201, 409])
    const pending = []
    const player = await store.get(created.playerId)
    if (player?.activePredictionId) pending.push(player.activePredictionId)
    expect(pending).toHaveLength(1)
  })

  it('declines once and then refuses acceptance', async () => {
    const { store, created, offerId } = await wonStandard()
    const first = await handleDeclineOffer(header(created), offerId, 'd1', { players: store, predictions: store, now: () => resolvedAt, ...on })
    const second = await handleDeclineOffer(header(created), offerId, 'd2', { players: store, predictions: store, now: () => resolvedAt, ...on })
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    const accepted = await handleAcceptOffer(
      header(created),
      offerId,
      JSON.stringify({ idempotencyKey: '88888888-8888-4888-8888-888888888888' }),
      'after',
      { players: store, predictions: store, now: () => resolvedAt, quote: async () => quoteAt('84100.00', resolvedAt), ...on },
    )
    expect(JSON.parse(accepted.body ?? '').code).toBe('OFFER_DECLINED')
  })

  it('extends by 20 seconds and stops at the cap', async () => {
    const { store, created, offerId } = await wonStandard()
    const at = new Date('2026-10-11T15:01:05.000Z')
    const extended = await handleExtendOffer(header(created), offerId, 'e', { players: store, predictions: store, now: () => at, ...on })
    expect(extended.statusCode).toBe(200)
    expect(JSON.parse(extended.body ?? '')).toMatchObject({ extensions: 1, expiresAt: '2026-10-11T15:01:33.000Z' })
    const offer = await store.getOffer(created.playerId, offerId)
    if (offer) offer.extensions = 10
    const capped = await handleExtendOffer(header(created), offerId, 'cap', { players: store, predictions: store, now: () => at, ...on })
    expect(JSON.parse(capped.body ?? '').code).toBe('MAX_EXTENSIONS')
    const late = await handleExtendOffer(
      header(created),
      offerId,
      'late',
      { players: store, predictions: store, now: () => new Date('2026-10-11T15:02:00.000Z'), ...on },
    )
    expect(JSON.parse(late.body ?? '').code).toBe('OFFER_EXPIRED')
  })

  it('applies one of two concurrent extensions', async () => {
    const { store, created, offerId } = await wonStandard()
    const at = new Date('2026-10-11T15:01:05.000Z')
    const seen = (await store.getOffer(created.playerId, offerId))?.expiresAt ?? ''
    const [left, right] = await Promise.all([
      store.extendOffer(created.playerId, offerId, seen, at.toISOString()),
      store.extendOffer(created.playerId, offerId, seen, at.toISOString()),
    ])
    expect([left, right].sort()).toEqual(['conflict', 'extended'])
    expect((await store.getOffer(created.playerId, offerId))?.extensions).toBe(1)
  })

  it('replaces an open offer when a standard round starts', async () => {
    const { store, created, offerId } = await wonStandard()
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logs.push(String(line))
    })
    const at = new Date('2026-10-11T15:01:06.000Z')
    const createdRound = await handleCreatePrediction(
      header(created),
      JSON.stringify({ direction: 'DOWN', idempotencyKey: '99999999-9999-4999-8999-999999999999' }),
      'replace',
      { players: store, predictions: store, now: () => at, quote: async () => quoteAt('84200.00', at) },
    )
    expect(createdRound.statusCode).toBe(201)
    expect((await store.getOffer(created.playerId, offerId))?.status).toBe('REPLACED')
    expect(logs.some((line) => line.includes('"event":"offer.replaced"') && !line.includes(created.accessToken))).toBe(true)
    const accepted = await handleAcceptOffer(
      header(created),
      offerId,
      JSON.stringify({ idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
      'gone',
      { players: store, predictions: store, now: () => at, quote: async () => quoteAt('84200.00', at), ...on },
    )
    expect(JSON.parse(accepted.body ?? '').code).toBe('OFFER_REPLACED')
    spy.mockRestore()
  })

  it('hides an unknown offer and a disabled flag', async () => {
    const { store, created, offerId } = await wonStandard()
    const missing = await handleAcceptOffer(
      header(created),
      'o_p_0000000000000_00000000',
      JSON.stringify({ idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
      'missing',
      { players: store, predictions: store, now: () => resolvedAt, ...on },
    )
    expect(missing.statusCode).toBe(404)
    const disabled = await handleAcceptOffer(
      header(created),
      offerId,
      JSON.stringify({ idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }),
      'off',
      { players: store, predictions: store, now: () => resolvedAt, doubleDown: false },
    )
    expect(disabled.statusCode).toBe(404)
    const other = createPlayer(createdAt, (size) => Buffer.alloc(size, 9))
    await store.putNew(other)
    const foreign = await handleAcceptOffer(
      header(other),
      offerId,
      JSON.stringify({ idempotencyKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }),
      'foreign',
      { players: store, predictions: store, now: () => resolvedAt, ...on },
    )
    expect(foreign.statusCode).toBe(404)
  })

  it('returns the open offer from /me and drops it after the visibility window', async () => {
    const { store, created, offerId } = await wonStandard()
    const open = JSON.parse((await handleMe(header(created), 'me', { store, predictions: store, now: () => resolvedAt, ...on })).body ?? '')
    expect(open.offer).toMatchObject({ offerId, status: 'OPEN', expiresAt: '2026-10-11T15:01:13.000Z' })
    expect(open.features.doubleDown).toBe(true)
    const later = JSON.parse((await handleMe(
      header(created),
      'later',
      { store, predictions: store, now: () => new Date('2026-10-11T15:02:14.000Z'), ...on },
    )).body ?? '')
    expect(later.offer).toBeNull()
  })
})
