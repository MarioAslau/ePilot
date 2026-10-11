import { describe, expect, it } from 'vitest'
import type { MeResponse, Prediction } from 'contracts'
import { announcement, clockOffset, pollInterval, roundView, secondsRemaining } from '../round'

const start = Date.parse('2026-10-11T15:00:00.000Z')

function prediction(overrides: Partial<Prediction> = {}): Prediction {
  return {
    predictionId: 'p_0000000000000_abcd1234',
    playerId: 'anon_aabbccdd',
    direction: 'UP',
    mode: 'STANDARD',
    status: 'PENDING',
    createdAt: '2026-10-11T15:00:00.000Z',
    dueAt: '2026-10-11T15:01:00.000Z',
    entryPrice: '65000.10',
    entryTradeTime: '2026-10-11T14:59:58.000Z',
    ...overrides,
  }
}

function me(overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    playerId: 'anon_aabbccdd',
    score: 0,
    wins: 0,
    losses: 0,
    activePrediction: null,
    latestResolvedPrediction: null,
    waitReason: null,
    serverTime: '2026-10-11T15:00:00.000Z',
    ...overrides,
  }
}

describe('clock offset', () => {
  it('uses the midpoint of the request', () => {
    expect(clockOffset('2026-10-11T15:00:00.000Z', start, start + 400)).toBe(-200)
  })

  it('hits zero at the server deadline when the client clock is skewed', () => {
    const dueAt = '2026-10-11T15:01:00.000Z'
    const serverTime = start
    for (const skew of [5_000, -5_000]) {
      const offset = clockOffset(new Date(serverTime).toISOString(), start + skew, start + skew)
      expect(secondsRemaining(dueAt, offset, start + skew)).toBe(60)
      expect(secondsRemaining(dueAt, offset, start + 60_000 + skew)).toBe(0)
    }
  })
})

describe('pollInterval', () => {
  const base = {
    dueAt: '2026-10-11T15:01:00.000Z',
    offsetMs: 0,
    waitReason: 'WAITING_FOR_DEADLINE' as const,
  }

  it('waits 3s when idle, 2s while active, and 1s near the deadline or a hold', () => {
    expect(pollInterval({ ...base, hasActive: false, nowMs: start })).toBe(3_000)
    expect(pollInterval({ ...base, hasActive: true, nowMs: start })).toBe(2_000)
    expect(pollInterval({ ...base, hasActive: true, nowMs: start + 55_000 })).toBe(1_000)
    expect(pollInterval({ ...base, hasActive: true, nowMs: start, waitReason: 'EQUAL_PRICE' })).toBe(1_000)
    expect(pollInterval({ ...base, hasActive: true, nowMs: start, waitReason: 'PROVIDER_HOLD' })).toBe(1_000)
    expect(pollInterval({ ...base, hasActive: true, nowMs: start, waitReason: 'CHECKING_PRICE' })).toBe(1_000)
  })
})

describe('roundView', () => {
  const input = {
    placed: null,
    submitPhase: 'idle' as const,
    offsetMs: 0,
    nowMs: start,
  }

  it('is ready with no round', () => {
    expect(roundView({ ...input, me: me() }).phase).toBe('ready')
  })

  it('is active before the deadline', () => {
    const view = roundView({
      ...input,
      me: me({ activePrediction: prediction(), waitReason: 'WAITING_FOR_DEADLINE' }),
    })
    expect(view.phase).toBe('active')
    expect(view.remaining).toBe(60)
  })

  it('is checking at zero even when the server still says waiting', () => {
    const view = roundView({
      ...input,
      nowMs: start + 60_000,
      me: me({ activePrediction: prediction(), waitReason: 'WAITING_FOR_DEADLINE' }),
    })
    expect(view.phase).toBe('checking')
    expect(view.settled).toBeNull()
  })

  it('uses the server reason for equal and hold', () => {
    expect(roundView({
      ...input,
      nowMs: start + 61_000,
      me: me({ activePrediction: prediction(), waitReason: 'EQUAL_PRICE' }),
    }).phase).toBe('equal')
    expect(roundView({
      ...input,
      nowMs: start + 61_000,
      me: me({ activePrediction: prediction(), waitReason: 'PROVIDER_HOLD' }),
    }).phase).toBe('hold')
  })

  it('is a result only when the latest round settled', () => {
    const settled = prediction({
      status: 'RESOLVED',
      outcome: 'WIN',
      scoreDelta: 1,
      resolutionPrice: '65001',
      resolutionTradeTime: '2026-10-11T15:01:02.000Z',
      resolvedAt: '2026-10-11T15:01:03.000Z',
    })
    expect(roundView({ ...input, me: me({ latestResolvedPrediction: settled, score: 1, wins: 1 }) }).phase).toBe('result')
  })
})

describe('announcement', () => {
  it('speaks a placement, the end of the wait, and a result, but not a tick', () => {
    expect(announcement(null, 'active', { direction: 'UP', entryPrice: '1' })).toBeNull()
    expect(announcement('ready', 'active', { direction: 'UP', entryPrice: '1' })).toBeNull()
    expect(announcement('recording', 'active', { direction: 'UP', entryPrice: '1' })).toBe('Predicted Up. Entry price 1.')
    expect(announcement('active', 'checking', {})).toBe('Minimum wait complete. Checking the latest price.')
    expect(announcement('active', 'active', {})).toBeNull()
    expect(announcement('checking', 'result', { outcome: 'LOSS', score: -1 })).toBe('Not this time. Score -1.')
  })
})
