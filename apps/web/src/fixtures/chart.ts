import type { ChartRound } from '../chart/model'
import type { PriceSample } from '../chart/samples'
import { FIXTURE_NOW, type FixtureState } from './index'
import { fixtureSamples } from './samples'

/** A down feed's samples stop this long before "now", so the chart shows the delayed tail as a gap. */
const FEED_DOWN_TAIL_S = 25

/**
 * What the fixture chart shows: the server clock, the round (active, or settled when there is no follow-on),
 * and a seeded sample walk that ends on the fixture's price.
 */
export function fixtureChart(state: FixtureState): { now: number; round?: ChartRound; samples: PriceSample[] } {
  const active = state.activeRound
  const result = active ? undefined : state.result
  const round: ChartRound | undefined = active
    ? {
      direction: active.direction,
      waitReason: active.state,
      acceptedAt: active.entryTime.getTime(),
      earliestResolveAt: active.deadline.getTime(),
      entryPrice: active.entryPrice,
    }
    : result && {
      direction: result.direction,
      acceptedAt: result.entryTime.getTime(),
      earliestResolveAt: result.entryTime.getTime() + 60_000,
      entryPrice: result.entryPrice,
      result: { price: result.resolutionPrice, time: result.resolutionTime.getTime(), outcome: result.outcome },
    }
  // Mid-wait, a few seconds past the deadline, the compared trade, or the fixed fixture time.
  const now = active
    ? active.deadline.getTime() - (active.secondsRemaining ? active.secondsRemaining * 1_000 : -6_000)
    : round?.result?.time ?? FIXTURE_NOW.getTime()

  const around = round?.entryPrice ?? state.price
  const last = round?.result?.price ?? state.price ?? around
  if (!around || !last || state.noSamples) return { now, round, samples: [] }
  const feedDown = state.priceStatus === 'stale' || state.priceStatus === 'unavailable'
  const samples = fixtureSamples(around, last, now).filter((sample) => {
    const ago = (now - sample.time) / 1_000
    if (feedDown && ago < FEED_DOWN_TAIL_S) return false
    return !state.sampleGap || ago > state.sampleGap[0] || ago < state.sampleGap[1]
  })
  return { now, round, samples }
}
