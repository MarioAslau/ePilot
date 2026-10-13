import { describe, expect, it } from 'vitest'
import { chartWindow } from '../chart/model'
import { mergeSamples, SAMPLE_WINDOW_MS } from '../chart/samples'

const round = { acceptedAt: 100_000, earliestResolveAt: 160_000, entryPrice: '10' }

describe('chartWindow', () => {
  it('shows the last two minutes plus a short lead when idle', () => {
    expect(chartWindow(500_000)).toEqual({ start: 380_000, end: 504_000 })
  })

  it('frames the round from 45 s before entry to 10 s after the earliest result', () => {
    expect(chartWindow(120_000, round)).toEqual({ start: 55_000, end: 170_000 })
  })

  it('slides with a constant width after the deadline instead of stretching', () => {
    const later = chartWindow(200_000, round)
    expect(later).toEqual({ start: 89_000, end: 204_000 })
    expect(later.end - later.start).toBe(170_000 - 55_000)
  })
})

describe('mergeSamples', () => {
  it('dedupes by trade time, keeps time order, and drops samples past the window', () => {
    const now = SAMPLE_WINDOW_MS + 10_000
    const merged = mergeSamples(
      [{ price: 'old', time: 5_000 }, { price: 'a', time: 20_000 }],
      [{ price: 'c', time: 30_000 }, { price: 'a2', time: 20_000 }, { price: 'b', time: 15_000 }],
      now,
    )
    expect(merged).toEqual([
      { price: 'b', time: 15_000 },
      { price: 'a2', time: 20_000 },
      { price: 'c', time: 30_000 },
    ])
  })

  it('returns the same array when nothing arrives', () => {
    const current = [{ price: 'a', time: 1 }]
    expect(mergeSamples(current, [], 2)).toBe(current)
  })
})
