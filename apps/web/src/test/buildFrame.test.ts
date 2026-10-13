import { describe, expect, it } from 'vitest'
import { buildFrame, viewAt } from '../chart/buildFrame'

const size = { width: 1_150, height: 132 }
const round = { direction: 'UP' as const, acceptedAt: 100_000, earliestResolveAt: 160_000, entryPrice: '10' }
const samples = [90_000, 110_000, 120_000].map((time, index) => ({ price: String(10 + index), time }))

function frameAt(now: number, options: Partial<Parameters<typeof buildFrame>[1]> = {}, chartRound: typeof round & Record<string, unknown> = round) {
  const view = viewAt(samples, now, chartRound)
  return buildFrame(view, { round: chartRound, feed: 'live', size, range: view.target!, headValue: 12, ...options })
}

describe('buildFrame', () => {
  it('runs the head flat past the last quote while live, by at most 2.5 s', () => {
    const frame = frameAt(121_000)
    expect(frame.head!.sample.time).toBe(120_000)
    expect(frame.head!.x).toBeCloseTo(frame.scale.xOf(121_000))
    expect(frameAt(130_000).head!.x).toBeCloseTo(frame.scale.xOf(122_500))
    expect(frameAt(130_000, { feed: 'stale' }).head!.x).toBeCloseTo(frame.scale.xOf(120_000))
  })

  it('draws the line through the eased head value, not the real price', () => {
    const frame = frameAt(120_000, { headValue: 11.5 })
    const lastRun = frame.runs[frame.runs.length - 1]!
    expect(lastRun[lastRun.length - 1]![1]).toBeCloseTo(frame.scale.yOf(11.5))
    expect(frame.head!.sample.price).toBe('12')
  })

  it('puts the head dot on the entry line while the server reports an unchanged price', () => {
    const frame = frameAt(161_000, {}, { ...round, waitReason: 'EQUAL_PRICE' })
    expect(frame.head!.y).toBe(frame.entryY)
  })

  it('freezes a settled round on its compared trade, with no live head', () => {
    const settled = { ...round, result: { price: '9', time: 115_000, outcome: 'LOSS' as const } }
    const frame = frameAt(999_999, {}, settled)
    expect(frame.now).toBe(115_000)
    expect(frame.head).toBeNull()
    expect(frame.visible.map((sample) => sample.time)).toEqual([90_000, 110_000])
    expect(frame.compared).toEqual({ x: frame.scale.xOf(115_000), y: frame.scale.yOf(9) })
  })

  it('opens a tail gap to now when the feed is down', () => {
    expect(frameAt(140_000, { feed: 'unavailable' }).gaps).toContainEqual({ from: 120_000, to: 140_000 })
    expect(frameAt(140_000).gaps).not.toContainEqual({ from: 120_000, to: 140_000 })
  })
})
