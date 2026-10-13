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
}

function quoteAt(price: string, at: Date): TickerQuote {
  const trade = new Date(at.getTime() - 1_000)
  return { price, tradeTime: trade.toISOString(), fetchedAt: at.toISOString() }
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
    },
  )
  const player = await store.get(created.playerId)
  return { store, created, prediction, offerId: player?.openOfferId ?? '' }
}

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
      { predictions: store, players: store, now: () => resolvedAt, quote: async () => quoteAt('84000.00', resolvedAt) },
    )
    expect((await store.get(created.playerId))?.score).toBe(1)
    expect(await store.getOffer(created.playerId, offerId)).toMatchObject({ status: 'OPEN' })
  })

  it('skips the offer after a bonus win, and a loss opens Redemption instead', async () => {
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
      { predictions: store, players: store, now: () => resolvedAt, quote: async () => quoteAt('82000.00', resolvedAt) },
    )
    expect((await store.getOffer(created.playerId, offerIdFor(prediction.predictionId)))?.mode).toBe('REDEMPTION')

    const bonusGame = await wonStandard(6)
    const acceptAt = new Date('2026-10-11T15:01:05.000Z')
    const accepted = await handleAcceptOffer(
      header(bonusGame.created),
      bonusGame.offerId,
      JSON.stringify({ idempotencyKey: '66666666-6666-4666-8666-666666666666' }),
      'bonus',
      { players: bonusGame.store, predictions: bonusGame.store, now: () => acceptAt, quote: async () => quoteAt('84100.00', acceptAt), startWorkflow: async () => undefined },
    )
    const bonus = JSON.parse(accepted.body ?? '') as { predictionId: string; dueAt: string; playerId: string }
    const bonusResolved = new Date('2026-10-11T15:02:06.000Z')
    await handleResolvePrediction(
      { playerId: bonus.playerId, predictionId: bonus.predictionId, dueAt: bonus.dueAt },
      { predictions: bonusGame.store, players: bonusGame.store, now: () => bonusResolved, quote: async () => quoteAt('85000.00', bonusResolved) },
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
      { players: store, predictions: store, now: () => acceptAt, quote: async () => quoteAt('84100.00', acceptAt) },
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
    const first = await handleDeclineOffer(header(created), offerId, 'd1', { players: store, predictions: store, now: () => resolvedAt })
    const second = await handleDeclineOffer(header(created), offerId, 'd2', { players: store, predictions: store, now: () => resolvedAt })
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    const accepted = await handleAcceptOffer(
      header(created),
      offerId,
      JSON.stringify({ idempotencyKey: '88888888-8888-4888-8888-888888888888' }),
      'after',
      { players: store, predictions: store, now: () => resolvedAt, quote: async () => quoteAt('84100.00', resolvedAt) },
    )
    expect(JSON.parse(accepted.body ?? '').code).toBe('OFFER_DECLINED')
  })

  it('extends by 20 seconds and stops at the cap', async () => {
    const { store, created, offerId } = await wonStandard()
    const at = new Date('2026-10-11T15:01:05.000Z')
    const extended = await handleExtendOffer(header(created), offerId, 'e', { players: store, predictions: store, now: () => at })
    expect(extended.statusCode).toBe(200)
    expect(JSON.parse(extended.body ?? '')).toMatchObject({ extensions: 1, expiresAt: '2026-10-11T15:01:33.000Z' })
    const offer = await store.getOffer(created.playerId, offerId)
    if (offer) offer.extensions = 10
    const capped = await handleExtendOffer(header(created), offerId, 'cap', { players: store, predictions: store, now: () => at })
    expect(JSON.parse(capped.body ?? '').code).toBe('MAX_EXTENSIONS')
    const late = await handleExtendOffer(
      header(created),
      offerId,
      'late',
      { players: store, predictions: store, now: () => new Date('2026-10-11T15:02:00.000Z') },
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
      { players: store, predictions: store, now: () => at, quote: async () => quoteAt('84200.00', at) },
    )
    expect(JSON.parse(accepted.body ?? '').code).toBe('OFFER_REPLACED')
    spy.mockRestore()
  })

  it('hides an unknown offer and another player\'s offer', async () => {
    const { store, created, offerId } = await wonStandard()
    const missing = await handleAcceptOffer(
      header(created),
      'o_p_0000000000000_00000000',
      JSON.stringify({ idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
      'missing',
      { players: store, predictions: store, now: () => resolvedAt },
    )
    expect(missing.statusCode).toBe(404)
    const other = createPlayer(createdAt, (size) => Buffer.alloc(size, 9))
    await store.putNew(other)
    const foreign = await handleAcceptOffer(
      header(other),
      offerId,
      JSON.stringify({ idempotencyKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }),
      'foreign',
      { players: store, predictions: store, now: () => resolvedAt },
    )
    expect(foreign.statusCode).toBe(404)
  })

  it('returns the open offer from /me and drops it after the visibility window', async () => {
    const { store, created, offerId } = await wonStandard()
    const open = JSON.parse((await handleMe(header(created), 'me', { players: store, predictions: store, now: () => resolvedAt })).body ?? '')
    expect(open.offer).toMatchObject({ offerId, status: 'OPEN', expiresAt: '2026-10-11T15:01:13.000Z' })
    const later = JSON.parse((await handleMe(
      header(created),
      'later',
      { players: store, predictions: store, now: () => new Date('2026-10-11T15:02:14.000Z') },
    )).body ?? '')
    expect(later.offer).toBeNull()
  })
})

async function lostStandard(byte = 21) {
  const store = memoryGameStore()
  const created = createPlayer(createdAt, (size) => Buffer.alloc(size, byte))
  await store.putNew(created)
  const response = await handleCreatePrediction(
    header(created),
    JSON.stringify({ direction: 'UP', idempotencyKey: '12121212-1212-4121-8121-121212121212' }),
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
      quote: async () => quoteAt('82000.00', resolvedAt),
    },
  )
  const player = await store.get(created.playerId)
  return { store, created, prediction, offerId: player?.openOfferId ?? '' }
}

describe('Redemption settlement', () => {
  it('opens one direction-less offer on a standard loss and scores the follow-on once', async () => {
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      logs.push(String(line))
    })
    const { store, created, prediction, offerId } = await lostStandard()
    expect(offerId).toBe(offerIdFor(prediction.predictionId))
    const offer = await store.getOffer(created.playerId, offerId)
    expect(offer).toMatchObject({ mode: 'REDEMPTION', status: 'OPEN' })
    expect(offer?.direction).toBeUndefined()
    expect((await store.get(created.playerId))?.score).toBe(-1)
    await handleResolvePrediction(
      { playerId: prediction.playerId, predictionId: prediction.predictionId, dueAt: prediction.dueAt },
      { predictions: store, players: store, now: () => resolvedAt, quote: async () => quoteAt('82000.00', resolvedAt) },
    )
    expect((await store.get(created.playerId))?.score).toBe(-1)
    expect(logs.some((line) => line.includes('"event":"offer.created"') && line.includes('"mode":"REDEMPTION"') && !line.includes(created.accessToken))).toBe(true)

    const me = JSON.parse((await handleMe(header(created), 'me', { players: store, predictions: store, now: () => resolvedAt })).body ?? '')
    expect(me.offer).toMatchObject({
      mode: 'REDEMPTION',
      direction: null,
      payout: { win: 4, loss: -2, parentDelta: -1 },
    })

    const winStore = memoryGameStore()
    const winner = createPlayer(createdAt, (size) => Buffer.alloc(size, 23))
    await winStore.putNew(winner)
    const winCreated = await handleCreatePrediction(
      header(winner),
      JSON.stringify({ direction: 'UP', idempotencyKey: '14141414-1414-4141-8141-141414141414' }),
      'win',
      { players: winStore, predictions: winStore, now: () => createdAt, quote: async () => entry },
    )
    const winPrediction = JSON.parse(winCreated.body ?? '') as { predictionId: string; dueAt: string; playerId: string }
    await handleResolvePrediction(
      { playerId: winPrediction.playerId, predictionId: winPrediction.predictionId, dueAt: winPrediction.dueAt },
      { predictions: winStore, players: winStore, now: () => resolvedAt, quote: async () => quoteAt('85000.00', resolvedAt) },
    )
    expect((await winStore.getOffer(winner.playerId, offerIdFor(winPrediction.predictionId)))?.mode).toBe('DOUBLE_DOWN')
    spy.mockRestore()
  })

  it('does not offer again after a redemption round, and a win stays Double Down', async () => {
    const { store, created, offerId } = await lostStandard(24)
    const acceptAt = new Date('2026-10-11T15:01:05.000Z')
    const accepted = await handleAcceptOffer(
      header(created),
      offerId,
      JSON.stringify({ idempotencyKey: '00000024-0000-4000-8000-000000000024', direction: 'DOWN' }),
      'rd',
      { players: store, predictions: store, now: () => acceptAt, quote: async () => quoteAt('81000.00', acceptAt), startWorkflow: async () => undefined },
    )
    const bonus = JSON.parse(accepted.body ?? '') as { predictionId: string; dueAt: string; playerId: string; mode: string }
    expect(bonus.mode).toBe('REDEMPTION')
    const bonusResolved = new Date('2026-10-11T15:02:06.000Z')
    await handleResolvePrediction(
      { playerId: bonus.playerId, predictionId: bonus.predictionId, dueAt: bonus.dueAt },
      { predictions: store, players: store, now: () => bonusResolved, quote: async () => quoteAt('80000.00', bonusResolved) },
    )
    expect(await store.getOffer(created.playerId, offerIdFor(bonus.predictionId))).toBeNull()
    expect(await store.get(created.playerId)).toMatchObject({ score: 3, wins: 1, losses: 1 })
    expect((await store.get(created.playerId))?.openOfferId).toBeUndefined()
    const parent = JSON.parse((await handleMe(header(created), 'me', { players: store, predictions: store, now: () => bonusResolved })).body ?? '')
    expect(parent.latestResolvedPrediction.parent).toEqual({ predictionId: offerId.slice(2), scoreDelta: -1 })
    expect((await store.getOffer(created.playerId, offerId))?.chosenDirection).toBe('DOWN')
  })
})

describe('POST /offers redemption', () => {
  it('requires a direction and keeps the offer open', async () => {
    const { store, created, offerId } = await lostStandard(25)
    const missing = await handleAcceptOffer(
      header(created),
      offerId,
      JSON.stringify({ idempotencyKey: '00000025-0000-4000-8000-000000000025' }),
      'missing',
      { players: store, predictions: store, now: () => resolvedAt, quote: async () => quoteAt('81000.00', resolvedAt) },
    )
    expect(missing.statusCode).toBe(400)
    expect(JSON.parse(missing.body ?? '').code).toBe('DIRECTION_REQUIRED')
    const invalid = await handleAcceptOffer(
      header(created),
      offerId,
      JSON.stringify({ idempotencyKey: '00000025-0000-4000-8000-000000000025', direction: 'SIDEWAYS' }),
      'bad',
      { players: store, predictions: store, now: () => resolvedAt },
    )
    expect(JSON.parse(invalid.body ?? '').code).toBe('DIRECTION_REQUIRED')
    expect((await store.getOffer(created.playerId, offerId))?.status).toBe('OPEN')
  })

  it('starts the chosen direction, replays the same one, and conflicts on the other', async () => {
    const { store, created, offerId } = await lostStandard(26)
    const started: string[] = []
    const acceptAt = new Date('2026-10-11T15:01:05.000Z')
    const key = '00000026-0000-4000-8000-000000000026'
    const response = await handleAcceptOffer(
      header(created),
      offerId,
      JSON.stringify({ idempotencyKey: key, direction: 'UP' }),
      'up',
      {
        players: store,
        predictions: store,
        now: () => acceptAt,
        quote: async () => quoteAt('82100.00', acceptAt),
        startWorkflow: async (input) => {
          started.push(input.predictionId)
        },
      },
    )
    expect(response.statusCode).toBe(201)
    const body = JSON.parse(response.body ?? '')
    expect(body).toMatchObject({ mode: 'REDEMPTION', direction: 'UP', dueAt: '2026-10-11T15:02:05.000Z' })
    expect(started).toEqual([body.predictionId])
    expect((await store.getOffer(created.playerId, offerId))?.chosenDirection).toBe('UP')
    const replay = await handleAcceptOffer(
      header(created),
      offerId,
      JSON.stringify({ idempotencyKey: key, direction: 'UP' }),
      'replay',
      { players: store, predictions: store, now: () => acceptAt, quote: async () => quoteAt('82100.00', acceptAt) },
    )
    expect(replay.statusCode).toBe(200)
    expect(JSON.parse(replay.body ?? '').predictionId).toBe(body.predictionId)
    const other = await handleAcceptOffer(
      header(created),
      offerId,
      JSON.stringify({ idempotencyKey: key, direction: 'DOWN' }),
      'other',
      { players: store, predictions: store, now: () => acceptAt },
    )
    expect(JSON.parse(other.body ?? '').code).toBe('IDEMPOTENCY_CONFLICT')
    expect(started).toHaveLength(1)
  })

  it('expires, declines, and extends', async () => {
    const { store, created, offerId } = await lostStandard(27)
    const expired = await handleAcceptOffer(
      header(created),
      offerId,
      JSON.stringify({ idempotencyKey: '00000027-0000-4000-8000-000000000027', direction: 'DOWN' }),
      'late',
      { players: store, predictions: store, now: () => new Date('2026-10-11T15:01:13.000Z'), quote: async () => quoteAt('81000.00', new Date('2026-10-11T15:01:13.000Z')) },
    )
    expect(JSON.parse(expired.body ?? '').code).toBe('OFFER_EXPIRED')

    const fresh = await lostStandard(28)
    const at = new Date('2026-10-11T15:01:05.000Z')
    const extended = await handleExtendOffer(header(fresh.created), fresh.offerId, 'ext', { players: fresh.store, predictions: fresh.store, now: () => at })
    expect(JSON.parse(extended.body ?? '')).toMatchObject({ extensions: 1, mode: 'REDEMPTION' })
    const declined = await handleDeclineOffer(header(fresh.created), fresh.offerId, 'no', { players: fresh.store, predictions: fresh.store, now: () => at })
    expect(declined.statusCode).toBe(200)
    const after = await handleAcceptOffer(
      header(fresh.created),
      fresh.offerId,
      JSON.stringify({ idempotencyKey: '00000028-0000-4000-8000-000000000028', direction: 'UP' }),
      'after',
      { players: fresh.store, predictions: fresh.store, now: () => at, quote: async () => quoteAt('81000.00', at) },
    )
    expect(JSON.parse(after.body ?? '').code).toBe('OFFER_DECLINED')

  })

  it('lets one of two accepts win, and one of accept or create', async () => {
    const { store, created, offerId } = await lostStandard(30)
    const acceptAt = new Date('2026-10-11T15:01:05.000Z')
    const deps = {
      players: store,
      predictions: store,
      now: () => acceptAt,
      quote: async () => quoteAt('81000.00', acceptAt),
    }
    const [left, right] = await Promise.all([
      handleAcceptOffer(header(created), offerId, JSON.stringify({ idempotencyKey: '00000030-0000-4000-8000-000000000030', direction: 'UP' }), 'a', deps),
      handleAcceptOffer(header(created), offerId, JSON.stringify({ idempotencyKey: '00000030-0000-4000-8000-000000000031', direction: 'DOWN' }), 'b', deps),
    ])
    expect([left.statusCode, right.statusCode].sort()).toEqual([201, 409])
    expect((await store.get(created.playerId))?.activePredictionId).toBeTruthy()

    const race = await lostStandard(31)
    const [accepted, createdRound] = await Promise.all([
      handleAcceptOffer(
        header(race.created),
        race.offerId,
        JSON.stringify({ idempotencyKey: '00000031-0000-4000-8000-000000000031', direction: 'DOWN' }),
        'accept',
        { ...deps, players: race.store, predictions: race.store },
      ),
      handleCreatePrediction(
        header(race.created),
        JSON.stringify({ direction: 'UP', idempotencyKey: '00000031-0000-4000-8000-000000000032' }),
        'create',
        { players: race.store, predictions: race.store, now: () => acceptAt, quote: async () => quoteAt('81000.00', acceptAt) },
      ),
    ])
    expect([accepted.statusCode, createdRound.statusCode].sort()).toEqual([201, 409])
    const player = await race.store.get(race.created.playerId)
    expect(player?.activePredictionId).toBeTruthy()
    expect(player?.openOfferId).toBeUndefined()
  })

  it('replaces an open redemption offer when a normal round starts', async () => {
    const { store, created, offerId } = await lostStandard(32)
    const at = new Date('2026-10-11T15:01:06.000Z')
    const createdRound = await handleCreatePrediction(
      header(created),
      JSON.stringify({ direction: 'UP', idempotencyKey: '00000032-0000-4000-8000-000000000032' }),
      'replace',
      { players: store, predictions: store, now: () => at, quote: async () => quoteAt('82100.00', at) },
    )
    expect(createdRound.statusCode).toBe(201)
    expect((await store.getOffer(created.playerId, offerId))?.status).toBe('REPLACED')
    const accepted = await handleAcceptOffer(
      header(created),
      offerId,
      JSON.stringify({ idempotencyKey: '00000032-0000-4000-8000-000000000033', direction: 'DOWN' }),
      'gone',
      { players: store, predictions: store, now: () => at, quote: async () => quoteAt('82100.00', at) },
    )
    expect(JSON.parse(accepted.body ?? '').code).toBe('OFFER_REPLACED')
  })

  it('scores a redemption loss as minus 2', async () => {
    const { store, created, offerId } = await lostStandard(33)
    const acceptAt = new Date('2026-10-11T15:01:05.000Z')
    const accepted = await handleAcceptOffer(
      header(created),
      offerId,
      JSON.stringify({ idempotencyKey: '00000033-0000-4000-8000-000000000033', direction: 'UP' }),
      'up',
      { players: store, predictions: store, now: () => acceptAt, quote: async () => quoteAt('82100.00', acceptAt), startWorkflow: async () => undefined },
    )
    const bonus = JSON.parse(accepted.body ?? '') as { predictionId: string; dueAt: string; playerId: string }
    const bonusResolved = new Date('2026-10-11T15:02:06.000Z')
    await handleResolvePrediction(
      { playerId: bonus.playerId, predictionId: bonus.predictionId, dueAt: bonus.dueAt },
      { predictions: store, players: store, now: () => bonusResolved, quote: async () => quoteAt('81000.00', bonusResolved) },
    )
    expect(await store.get(created.playerId)).toMatchObject({ score: -3, wins: 0, losses: 2 })
    expect(await store.getOffer(created.playerId, offerIdFor(bonus.predictionId))).toBeNull()
  })
})
