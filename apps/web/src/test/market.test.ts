import { describe, expect, it } from 'vitest'
import { appendSample, chartSummary, feedStatus, type PriceSample } from '../market'

const sample = (receivedAt: number, tradeTime: string, price = '10'): PriceSample => ({
  price,
  tradeTime,
  receivedAt,
})

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

describe('appendSample', () => {
  it('keeps one sample per trade time and drops samples older than 10 minutes', () => {
    const first = appendSample([], { price: '10', tradeTime: 't1', isFresh: true }, 0)
    const duplicate = appendSample(first, { price: '11', tradeTime: 't1', isFresh: true }, 1_000)
    const withOld = appendSample(
      duplicate,
      { price: '12', tradeTime: 't2', isFresh: true },
      10 * 60 * 1000 + 1,
    )

    expect(duplicate).toHaveLength(1)
    expect(withOld.map((item) => item.tradeTime)).toEqual(['t2'])
  })

  it('ignores a quote the server marked stale', () => {
    const samples = appendSample(
      [sample(0, 't1')],
      { price: '12', tradeTime: 't2', isFresh: false },
      1_000,
    )
    expect(samples).toHaveLength(1)
  })
})

describe('chartSummary', () => {
  it('withholds the 1 minute change until a sample is 60 seconds old', () => {
    const samples = [sample(0, 't1', '10'), sample(59_000, 't2', '12')]
    expect(chartSummary(samples, 59_000).change1m).toBeNull()
    expect(chartSummary(samples, 60_000).change1m).toBe(2)
  })
})
