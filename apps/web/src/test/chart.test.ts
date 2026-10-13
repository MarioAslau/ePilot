import { describe, expect, it } from 'vitest'
import {
  chartWindow,
  easedValue,
  headTime,
  HEAD_EXTENSION_MS,
  chartRoundFor,
  gridLines,
  holdLabel,
  isSettled,
  makeScale,
  segments,
  settledSamples,
  pointsFrom,
  stepRange,
  targetRange,
  visibleSamples,
  winningSide,
  xTicks,
} from '../chart/model'
import { stance } from '../round'
import { mergeSamples, SAMPLE_WINDOW_MS } from '../chart/samples'

const round = { direction: 'UP' as const, acceptedAt: 100_000, earliestResolveAt: 160_000, entryPrice: '10' }

describe('chartWindow', () => {
  it('shows the last two minutes plus a short lead when idle', () => {
    expect(chartWindow(500_000)).toEqual({ start: 380_000, end: 504_000 })
  })

  it('frames the round from 45 s before entry to 10 s after the earliest result', () => {
    expect(chartWindow(120_000, round)).toEqual({ start: 55_000, end: 170_000 })
  })

  it('freezes a settled round with room after the compared trade', () => {
    const settled = { ...round, result: { price: '11', time: 175_000, outcome: 'WIN' as const } }
    expect(chartWindow(999_999, settled)).toEqual({ start: 70_000, end: 185_000 })
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
    expect(scale.yOf(10)).toBe(26)
    expect(scale.yOf(0)).toBe(118)
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

describe('board', () => {
  it('decides ahead, behind and level for both directions', () => {
    expect(stance('UP', '100', '101').tone).toBe('ahead')
    expect(stance('UP', '100', '99').tone).toBe('behind')
    expect(stance('DOWN', '100', '99').tone).toBe('ahead')
    expect(stance('DOWN', '100', '101').tone).toBe('behind')
    expect(stance('DOWN', '100', '100.00').tone).toBe('level')
  })

  it('colours the winning side by direction: Up above, Down below', () => {
    expect(winningSide('UP')).toBe('above')
    expect(winningSide('DOWN')).toBe('below')
  })

  it('picks at most two round gridline prices inside the range', () => {
    expect(gridLines({ low: 65_405, high: 65_437 })).toEqual([65_410, 65_420])
    expect(gridLines({ low: 0, high: 0 })).toEqual([])
    gridLines({ low: 83_700.5, high: 83_790.2 }).forEach((level) => {
      expect(level).toBeGreaterThan(83_700.5)
      expect(level).toBeLessThan(83_790.2)
    })
  })

  it('ticks seconds since entry with 60s on the result line, and minutes ago when idle', () => {
    expect(xTicks(500_000, round)).toEqual([
      { time: 100_000, label: '0s' },
      { time: 130_000, label: '30s' },
      { time: 160_000, label: '60s' },
    ])
    expect(xTicks(500_000).map((tick) => tick.label)).toEqual(['−2m', '−1m', 'Now'])
  })

  it('cuts a polyline at x with an interpolated first point', () => {
    expect(pointsFrom([[0, 0], [10, 10], [20, 0]], 5)).toEqual([[5, 5], [10, 10], [20, 0]])
    expect(pointsFrom([[0, 0], [10, 10]], 10)).toEqual([[10, 10]])
    expect(pointsFrom([[0, 0]], 5)).toEqual([])
  })
})

describe('edge states', () => {
  const at = (...times: number[]) => times.map((time) => ({ time }))

  it('breaks the line where samples are more than 8 s apart, and never joins across', () => {
    const { runs, gaps } = segments(at(0, 1_000, 2_000, 12_000, 13_000), 13_000, false)
    expect(runs.map((run) => run.map((sample) => sample.time))).toEqual([[0, 1_000, 2_000], [12_000, 13_000]])
    expect(gaps).toEqual([{ from: 2_000, to: 12_000 }])
  })

  it('treats exactly 8 s as joined', () => {
    expect(segments(at(0, 8_000), 8_000, false).gaps).toEqual([])
  })

  it('adds a gap from the last sample to now while the feed is down', () => {
    expect(segments(at(0, 1_000), 30_000, true).gaps).toEqual([{ from: 1_000, to: 30_000 }])
    expect(segments(at(0, 1_000), 30_000, false).gaps).toEqual([])
    expect(segments([], 30_000, true)).toEqual({ runs: [], gaps: [] })
  })

  it('labels an unchanged price and a provider hold, and nothing else', () => {
    expect(holdLabel({ ...round, waitReason: 'EQUAL_PRICE' })).toEqual({ text: 'Level · still waiting', kind: 'level' })
    expect(holdLabel({ ...round, waitReason: 'PROVIDER_HOLD' })).toEqual({ text: 'On hold · not a loss', kind: 'hold' })
    expect(holdLabel({ ...round, waitReason: 'CHECKING_PRICE' })).toBeNull()
    expect(holdLabel()).toBeNull()
  })
})

describe('result', () => {
  const prediction = {
    predictionId: 'p_1',
    playerId: 'anon_1',
    direction: 'DOWN' as const,
    mode: 'STANDARD' as const,
    status: 'RESOLVED' as const,
    createdAt: '2026-10-11T15:00:00.000Z',
    dueAt: '2026-10-11T15:01:00.000Z',
    entryPrice: '100',
    entryTradeTime: '2026-10-11T14:59:59.000Z',
    outcome: 'WIN' as const,
    resolutionPrice: '99',
    resolutionTradeTime: '2026-10-11T15:01:02.000Z',
  }

  it('maps a resolved prediction to a settled chart round on the trade clock', () => {
    const chart = chartRoundFor(prediction)
    expect(isSettled(chart)).toBe(true)
    expect(chart).toMatchObject({
      direction: 'DOWN',
      acceptedAt: Date.parse('2026-10-11T14:59:59.000Z'),
      earliestResolveAt: Date.parse('2026-10-11T15:01:00.000Z'),
      result: { price: '99', time: Date.parse('2026-10-11T15:01:02.000Z'), outcome: 'WIN' },
    })
  })

  it('leaves a pending prediction unsettled', () => {
    const pending = { ...prediction, status: 'PENDING' as const, outcome: undefined, resolutionPrice: undefined, resolutionTradeTime: undefined }
    expect(isSettled(chartRoundFor(pending, 'CHECKING_PRICE'))).toBe(false)
  })

  it('keeps only the samples of a settled round, up to the compared trade', () => {
    const settled = { ...round, result: { price: '11', time: 175_000, outcome: 'WIN' as const } }
    const samples = [{ time: 60_000 }, { time: 80_000 }, { time: 175_000 }, { time: 176_000 }]
    expect(settledSamples(samples, settled)).toEqual([{ time: 80_000 }, { time: 175_000 }])
    expect(settledSamples(samples, round)).toEqual([])
  })
})
