import type { Direction, Outcome, Prediction, WaitReason } from 'contracts'

/** What the chart is showing. All times are server milliseconds. */
export type ChartRound = {
  direction: Direction
  /** The server's reason the round is still open, when it has one. */
  waitReason?: WaitReason
  acceptedAt: number
  earliestResolveAt: number
  entryPrice: string
  /** Set once the round settles: the compared trade. The chart then freezes on it. */
  result?: { price: string; time: number; outcome: Outcome }
}

export type SettledRound = ChartRound & { result: NonNullable<ChartRound['result']> }

export function isSettled(round?: ChartRound): round is SettledRound {
  return Boolean(round?.result)
}

/** The chart's view of a round from the server. A resolved round carries its compared trade. */
export function chartRoundFor(prediction: Prediction, waitReason?: WaitReason): ChartRound {
  const { outcome, resolutionPrice, resolutionTradeTime } = prediction
  return {
    direction: prediction.direction,
    waitReason,
    acceptedAt: Date.parse(prediction.entryTradeTime),
    earliestResolveAt: Date.parse(prediction.dueAt),
    entryPrice: prediction.entryPrice,
    result: outcome && resolutionPrice && resolutionTradeTime
      ? { price: resolutionPrice, time: Date.parse(resolutionTradeTime), outcome }
      : undefined,
  }
}

export interface ChartWindow {
  start: number
  end: number
}

const IDLE_BACK_MS = 120_000
const LEAD_MS = 4_000
/** Room right of the compared trade for its marker and bracket. */
const RESULT_LEAD_MS = 10_000
const BEFORE_ENTRY_MS = 45_000
const AFTER_DEADLINE_MS = 10_000

/**
 * Idle: the last two minutes. Active: from 45 s before the entry to 10 s after the earliest result.
 * After the deadline the active window slides with a fixed width instead of stretching.
 */
export function chartWindow(now: number, round?: ChartRound): ChartWindow {
  if (!round) return { start: now - IDLE_BACK_MS, end: now + LEAD_MS }
  const start = round.acceptedAt - BEFORE_ENTRY_MS
  const end = round.earliestResolveAt + AFTER_DEADLINE_MS
  // A settled round freezes as if it were the moment of the compared trade.
  const at = round.result ? round.result.time + RESULT_LEAD_MS : now + LEAD_MS
  const slidEnd = Math.max(end, at)
  return { start: start + (slidEnd - end), end: slidEnd }
}

/** A price span on the y axis. */
export interface Range {
  low: number
  high: number
}

export interface Size {
  width: number
  height: number
}

/** Maps server time and price to pixels inside the chart. */
export interface Scale {
  window: ChartWindow
  range: Range
  size: Size
  xOf: (time: number) => number
  yOf: (price: number) => number
}

/** Space kept above the line for the result label, and below it for the head dot. */
export const PAD_TOP = 26
export const PAD_BOTTOM = 14
/** The y range never gets narrower than this share of the price, so tiny moves do not look like cliffs. */
const MIN_SPAN_SHARE = 0.0002
const RANGE_MARGIN = 0.12

export function makeScale(window: ChartWindow, range: Range, size: Size): Scale {
  const spanT = window.end - window.start || 1
  const spanP = range.high - range.low || 1
  const plot = Math.max(0, size.height - PAD_TOP - PAD_BOTTOM)
  return {
    window,
    range,
    size,
    xOf: (time) => ((time - window.start) / spanT) * size.width,
    yOf: (price) => PAD_TOP + (1 - (price - range.low) / spanP) * plot,
  }
}

/** The range the y axis is heading toward: every visible price, plus the entry, with a margin. */
export function targetRange(prices: number[]): Range | null {
  const finite = prices.filter((price) => Number.isFinite(price))
  if (finite.length === 0) return null
  const low = Math.min(...finite)
  const high = Math.max(...finite)
  const mid = (low + high) / 2
  const span = Math.max(high - low, Math.abs(mid) * MIN_SPAN_SHARE)
  const margin = span * RANGE_MARGIN
  return { low: mid - span / 2 - margin, high: mid + span / 2 + margin }
}

/** One frame of easing toward the target range. `factor` 1 jumps straight there. */
export function stepRange(current: Range | null, target: Range, factor = 0.12): Range {
  if (!current) return target
  return {
    low: current.low + (target.low - current.low) * factor,
    high: current.high + (target.high - current.high) * factor,
  }
}

export function easeOutCubic(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress))
  return 1 - (1 - clamped) ** 3
}

/** The eased value of a move from `from` to `to` that started at `startedAt` and lasts `duration` ms. */
export function easedValue(from: number, to: number, startedAt: number, at: number, duration = 450): number {
  return from + (to - from) * easeOutCubic((at - startedAt) / duration)
}

/** How far the line may run flat past the last real quote while the feed is live. */
export const HEAD_EXTENSION_MS = 2_500

/** Where the line's head sits in time: the last quote, extended flat toward now while live. */
export function headTime(lastTime: number, now: number, live: boolean): number {
  return live ? Math.max(lastTime, Math.min(now, lastTime + HEAD_EXTENSION_MS)) : lastTime
}

/** Samples inside the window, plus the one just before it so the line enters from the left edge. */
export function visibleSamples<T extends { time: number }>(samples: T[], window: ChartWindow): T[] {
  const firstInside = samples.findIndex((sample) => sample.time >= window.start)
  if (firstInside === -1) return samples.length ? samples.slice(-1) : []
  return samples.slice(Math.max(0, firstInside - 1)).filter((sample) => sample.time <= window.end)
}

/** Up to two round price levels inside the range, for light gridlines. */
export function gridLines(range: Range): number[] {
  const span = range.high - range.low
  if (!(span > 0)) return []
  const rough = span / 4
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((unit) => unit * magnitude).find((candidate) => candidate >= rough) ?? rough
  const levels: number[] = []
  for (let level = Math.ceil(range.low / step) * step; level < range.high; level += step) levels.push(level)
  if (levels.length <= 2) return levels
  const middle = Math.floor((levels.length - 2) / 2)
  return levels.slice(middle, middle + 2)
}

/** Labelled times under the chart: seconds since entry in a round (60s sits on the result line), minutes ago when idle. */
export function xTicks(now: number, round?: ChartRound): { time: number; label: string }[] {
  if (!round) {
    return [
      { time: now - 120_000, label: '−2m' },
      { time: now - 60_000, label: '−1m' },
      { time: now, label: 'Now' },
    ]
  }
  const { acceptedAt, earliestResolveAt } = round
  return [
    { time: acceptedAt, label: '0s' },
    { time: (acceptedAt + earliestResolveAt) / 2, label: '30s' },
    { time: earliestResolveAt, label: '60s' },
  ]
}

/** The head's state label when the server holds the round: an unchanged price, or a provider outage. */
export function holdLabel(round?: ChartRound): { text: string; kind: 'level' | 'hold' } | null {
  if (round?.waitReason === 'EQUAL_PRICE') return { text: 'Level · still waiting', kind: 'level' }
  if (round?.waitReason === 'PROVIDER_HOLD') return { text: 'On hold · not a loss', kind: 'hold' }
  return null
}

/** A settled round's samples between the start of its window and the compared trade. Empty after a reload. */
export function settledSamples<T extends { time: number }>(samples: T[], round: ChartRound): T[] {
  if (!round.result) return []
  const { start } = chartWindow(round.result.time, round)
  const end = round.result.time
  return samples.filter((sample) => sample.time >= start && sample.time <= end)
}

/** Which side of the entry line wins for this call. An Up call wins above, a Down call below. */
export function winningSide(direction: Direction): 'above' | 'below' {
  return direction === 'UP' ? 'above' : 'below'
}

/** The part of a polyline from `x` onward, starting with an interpolated point exactly at `x`. */
export function pointsFrom(points: [number, number][], x: number): [number, number][] {
  const index = points.findIndex(([px]) => px >= x)
  if (index === -1) return []
  const at = points[index]!
  const before = points[index - 1]
  if (!before || at[0] === x) return points.slice(index)
  const share = (x - before[0]) / (at[0] - before[0])
  return [[x, before[1] + (at[1] - before[1]) * share], ...points.slice(index)]
}

/** Two samples further apart than this are not joined: the chart shows a gap instead. */
export const GAP_MS = 8_000

export interface Gap {
  from: number
  to: number
}

/**
 * Splits samples into runs that the line may join, and lists the gaps between them.
 * A delayed or unavailable feed also leaves a gap from the last sample to now.
 */
export function segments<T extends { time: number }>(
  samples: T[],
  now: number,
  feedDown: boolean,
): { runs: T[][]; gaps: Gap[] } {
  const runs: T[][] = []
  const gaps: Gap[] = []
  let run: T[] = []
  samples.forEach((sample, index) => {
    const previous = samples[index - 1]
    if (previous && sample.time - previous.time > GAP_MS) {
      runs.push(run)
      gaps.push({ from: previous.time, to: sample.time })
      run = []
    }
    run.push(sample)
  })
  if (run.length) runs.push(run)
  const last = samples[samples.length - 1]
  if (feedDown && last && now > last.time) gaps.push({ from: last.time, to: now })
  return { runs, gaps }
}
