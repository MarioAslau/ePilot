import type { FeedStatus } from '../market'
import {
  chartWindow,
  headTime,
  makeScale,
  segments,
  targetRange,
  visibleSamples,
  type ChartRound,
  type ChartWindow,
  type Gap,
  type Range,
  type Scale,
  type Size,
} from './model'
import type { PriceSample } from './samples'

type Point = { x: number; y: number }

/** Everything a layer needs to draw one frame, already in pixels. Built by `buildFrame`, read by painters. */
export interface Frame {
  scale: Scale
  now: number
  round?: ChartRound
  /** The real samples on screen, oldest first. */
  visible: PriceSample[]
  /** Runs of line points; the line is never drawn across a gap. The last run ends at the line's head. */
  runs: [number, number][][]
  /** Time spans with no price data, including a delayed feed's tail. */
  gaps: Gap[]
  /** The head dot and the last real quote. On an unchanged price the dot sits on the entry line. */
  head: (Point & { sample: PriceSample }) | null
  /** The entry line's height, in a round. */
  entryY: number | null
  /** The compared trade, once the round has settled. */
  compared: Point | null
}

/** What the chart shows at `now`, before any easing: the window, the samples in it, and the y range they need. */
export interface View {
  now: number
  window: ChartWindow
  visible: PriceSample[]
  target: Range | null
}

/**
 * The view at `now`. A settled round freezes on its compared trade:
 * the clock stops there and the line ends there.
 */
export function viewAt(samples: PriceSample[], now: number, round?: ChartRound): View {
  const result = round?.result
  const at = result ? result.time : now
  const window = chartWindow(at, round)
  const visible = visibleSamples(result ? samples.filter((sample) => sample.time <= result.time) : samples, window)
  const prices = visible.map((sample) => Number(sample.price))
  if (round) prices.push(Number(round.entryPrice))
  if (result) prices.push(Number(result.price))
  return { now: at, window, visible, target: targetRange(prices) }
}

/**
 * Turns a view into pixels. `range` is the eased y range and `headValue` the eased price of the last quote;
 * pass the target and the real price to draw without easing.
 */
export function buildFrame(
  view: View,
  { round, feed, size, range, headValue }: { round?: ChartRound; feed: FeedStatus; size: Size; range: Range; headValue: number | null },
): Frame {
  const { now, window, visible } = view
  const scale = makeScale(window, range, size)
  const { runs: sampleRuns, gaps } = segments(visible, now, feed === 'stale' || feed === 'unavailable')
  const runs = sampleRuns.map((run) => run.map((sample): [number, number] => [scale.xOf(sample.time), scale.yOf(Number(sample.price))]))
  const entryY = round ? scale.yOf(Number(round.entryPrice)) : null
  const result = round?.result
  const compared = result ? { x: scale.xOf(result.time), y: scale.yOf(Number(result.price)) } : null

  // The live head: the last quote eases to its price, and runs flat toward now while the feed is live.
  const last = visible[visible.length - 1]
  const lastRun = runs[runs.length - 1]
  let head: Frame['head'] = null
  if (last && lastRun && headValue !== null && !result) {
    const time = headTime(last.time, now, feed === 'live')
    const x = scale.xOf(time)
    const y = scale.yOf(headValue)
    lastRun[lastRun.length - 1] = [scale.xOf(last.time), y]
    if (time > last.time) lastRun.push([x, y])
    // On an unchanged price the server compared the entry itself, so the dot sits on the entry line.
    const dotY = round?.waitReason === 'EQUAL_PRICE' && entryY !== null ? entryY : y
    head = { x, y: dotY, sample: last }
  }
  return { scale, now, round, visible, runs, gaps, head, entryY, compared }
}
