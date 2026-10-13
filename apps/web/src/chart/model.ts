/** What the chart is showing. All times are server milliseconds. */
export type ChartRound = {
  acceptedAt: number
  earliestResolveAt: number
  entryPrice: string
}

export interface ChartWindow {
  start: number
  end: number
}

const IDLE_BACK_MS = 120_000
const LEAD_MS = 4_000
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
  const slidEnd = Math.max(end, now + LEAD_MS)
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

/** Space kept above and below the line so the head dot and tags never touch the edge. */
export const PAD_Y = 16
/** The y range never gets narrower than this share of the price, so tiny moves do not look like cliffs. */
const MIN_SPAN_SHARE = 0.0002
const RANGE_MARGIN = 0.12

export function makeScale(window: ChartWindow, range: Range, size: Size): Scale {
  const spanT = window.end - window.start || 1
  const spanP = range.high - range.low || 1
  const plot = Math.max(0, size.height - PAD_Y * 2)
  return {
    window,
    range,
    size,
    xOf: (time) => ((time - window.start) / spanT) * size.width,
    yOf: (price) => PAD_Y + (1 - (price - range.low) / spanP) * plot,
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
