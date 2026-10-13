import { describe, expect, it } from 'vitest'
import { feedStatus, marketPollMs } from '../market'

describe('feedStatus', () => {
  const now = 20_000

  it('is loading before any price arrives', () => {
    expect(feedStatus({ lastGood: null, errored: false, now })).toBe('loading')
  })

  it('is unavailable when the first request fails', () => {
    expect(feedStatus({ lastGood: null, errored: true, now })).toBe('unavailable')
  })

  it('is live for a fresh recent price', () => {
    expect(feedStatus({
      lastGood: { receivedAt: now - 1_000, isFresh: true },
      errored: false,
      now,
    })).toBe('live')
  })

  it('is stale after an error, a stale trade, or 15 seconds', () => {
    const recent = { receivedAt: now - 1_000, isFresh: true }
    expect(feedStatus({ lastGood: recent, errored: true, now })).toBe('stale')
    expect(feedStatus({
      lastGood: { receivedAt: now - 1_000, isFresh: false },
      errored: false,
      now,
    })).toBe('stale')
    expect(feedStatus({
      lastGood: { receivedAt: now - 15_001, isFresh: true },
      errored: false,
      now,
    })).toBe('stale')
  })
})

describe('marketPollMs', () => {
  it('polls every 2 s until fastUntil, then every 5 s', () => {
    expect(marketPollMs(1_000, Infinity)).toBe(2_000)
    expect(marketPollMs(1_000, 10_000)).toBe(2_000)
    expect(marketPollMs(10_000, 10_000)).toBe(5_000)
    expect(marketPollMs(1_000, 0)).toBe(5_000)
  })
})
