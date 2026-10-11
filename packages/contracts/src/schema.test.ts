import { describe, expect, it } from 'vitest'
import { MeResponseSchema, OfferSchema, PredictionSchema } from './index.js'

const prediction = {
  predictionId: 'p_0000000000000_abcd1234',
  playerId: 'anon_aabbccdd',
  direction: 'UP',
  mode: 'STANDARD',
  status: 'RESOLVED',
  createdAt: '2026-10-11T15:00:00.000Z',
  dueAt: '2026-10-11T15:01:00.000Z',
  entryPrice: '65000.10',
  entryTradeTime: '2026-10-11T14:59:58.000Z',
  outcome: 'WIN',
  scoreDelta: 1,
}

describe('prediction contracts', () => {
  it('accepts a bonus score and rejects any other delta', () => {
    expect(PredictionSchema.parse({ ...prediction, mode: 'DOUBLE_DOWN', scoreDelta: 2 }).scoreDelta).toBe(2)
    expect(PredictionSchema.parse({ ...prediction, mode: 'DOUBLE_DOWN', scoreDelta: -2 }).scoreDelta).toBe(-2)
    expect(PredictionSchema.safeParse({ ...prediction, scoreDelta: 3 }).success).toBe(false)
    expect(PredictionSchema.safeParse({ ...prediction, scoreDelta: 0 }).success).toBe(false)
  })

  it('defaults a player response that has no offer', () => {
    const parsed = MeResponseSchema.parse({
      playerId: 'anon_aabbccdd',
      score: 1,
      wins: 1,
      losses: 0,
      activePrediction: null,
      latestResolvedPrediction: prediction,
      waitReason: null,
      serverTime: '2026-10-11T15:01:03.000Z',
    })
    expect(parsed.offer).toBeNull()
    expect(parsed.features.doubleDown).toBe(false)
  })

  it('round-trips an open offer', () => {
    const offer = {
      offerId: 'o_p_0000000000000_abcd1234',
      parentPredictionId: 'p_0000000000000_abcd1234',
      direction: 'UP',
      issuedAt: '2026-10-11T15:01:03.000Z',
      expiresAt: '2026-10-11T15:01:13.000Z',
      extensions: 0,
      status: 'OPEN',
    }
    expect(OfferSchema.parse(offer)).toEqual(offer)
  })
})
