import { describe, expect, it } from 'vitest'
import {
  chartWindow,
  easedValue,
  headTime,
  HEAD_EXTENSION_MS,
  makeScale,
  stepRange,
  targetRange,
  visibleSamples,
} from '../chart/model'
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

describe('scale and easing', () => {
  it('pads the target range and never collapses a flat price to zero height', () => {
    const range = targetRange([100_000, 100_000])
    expect(range).not.toBeNull()
    expect(range!.high - range!.low).toBeGreaterThan(20)
    expect(targetRange([Number.NaN])).toBeNull()
  })

  it('eases the range by the factor each frame, and jumps with factor 1', () => {
    const current = { low: 0, high: 100 }
    const target = { low: 100, high: 200 }
    expect(stepRange(current, target)).toEqual({ low: 12, high: 112 })
    expect(stepRange(current, target, 1)).toEqual(target)
    expect(stepRange(null, target)).toBe(target)
  })

  it('eases a new quote out over 450 ms', () => {
    expect(easedValue(0, 100, 0, 0)).toBe(0)
    expect(easedValue(0, 100, 0, 225)).toBeCloseTo(87.5)
    expect(easedValue(0, 100, 0, 450)).toBe(100)
    expect(easedValue(0, 100, 0, 9_000)).toBe(100)
  })

  it('maps the window to pixels', () => {
    const scale = makeScale({ start: 0, end: 100 }, { low: 0, high: 10 }, { width: 200, height: 132 })
    expect(scale.xOf(50)).toBe(100)
    expect(scale.yOf(10)).toBe(16)
    expect(scale.yOf(0)).toBe(116)
  })
})

describe('head and visible samples', () => {
  it('extends the head flat toward now for at most 2.5 s, only while live', () => {
    expect(headTime(1_000, 2_000, true)).toBe(2_000)
    expect(headTime(1_000, 9_000, true)).toBe(1_000 + HEAD_EXTENSION_MS)
    expect(headTime(1_000, 9_000, false)).toBe(1_000)
  })

  it('keeps one sample before the window so the line enters from the edge', () => {
    const samples = [{ time: 10 }, { time: 20 }, { time: 30 }, { time: 40 }]
    expect(visibleSamples(samples, { start: 25, end: 35 })).toEqual([{ time: 20 }, { time: 30 }])
    expect(visibleSamples(samples, { start: 50, end: 60 })).toEqual([{ time: 40 }])
    expect(visibleSamples([], { start: 0, end: 1 })).toEqual([])
  })
})
