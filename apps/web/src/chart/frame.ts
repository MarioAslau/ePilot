import { createContext, useContext, useLayoutEffect, useRef } from 'react'
import {
  chartWindow,
  easedValue,
  headTime,
  makeScale,
  segments,
  stepRange,
  targetRange,
  visibleSamples,
  type ChartRound,
  type Gap,
  type Range,
  type Scale,
  type Size,
} from './model'
import type { FeedStatus } from '../market'
import type { PriceSample } from './samples'

/** Everything a layer needs to draw one frame. Built by the loop, read by painters. */
export interface Frame {
  scale: Scale
  now: number
  round?: ChartRound
  /** The real samples on screen, oldest first. */
  visible: PriceSample[]
  /** The line's head: where it is drawn (eased value, extended time) and the real last quote. */
  head: { x: number; y: number; time: number; value: number; sample: PriceSample } | null
  /** Runs of line points in pixels; the line is never drawn across a gap. The last run ends at the drawn head. */
  runs: [number, number][][]
  /** Time spans with no price data, including a delayed feed's tail. */
  gaps: Gap[]
}

export type Painter = (frame: Frame) => void

export interface ChartData {
  samples: PriceSample[]
  /** Server time, as last reported. The loop advances it between reports while animating. */
  now: number
  round?: ChartRound
  feed: FeedStatus
  size: Size
}

interface Registry {
  register: (painter: Painter) => () => void
}

const FrameContext = createContext<Registry | null>(null)
export const FrameProvider = FrameContext.Provider

/** Registers a painter for every frame. The painter should only write to refs. */
export function usePainter(painter: Painter) {
  const registry = useContext(FrameContext)
  const latest = useRef(painter)
  latest.current = painter
  useLayoutEffect(() => registry?.register((frame) => latest.current(frame)), [registry])
}

/**
 * Drives the chart. With motion it runs a requestAnimationFrame loop while the page is visible:
 * the clock scrolls smoothly, a new quote eases in over 450 ms, and the y range eases toward its target.
 * With reduced motion it paints once per data change, with no easing. Nothing runs while the chart has no size.
 */
export function useChartFrame(data: ChartData, reduced: boolean): Registry {
  // A settled round is frozen, so it needs no loop: it paints once per data change, like reduced motion.
  const still = reduced || Boolean(data.round?.result)
  const painters = useRef(new Set<Painter>())
  const state = useRef({
    data,
    reportedAt: performance.now(),
    range: null as Range | null,
    head: null as { from: number; to: number; startedAt: number; time: number } | null,
  })
  const registry = useRef<Registry>({
    register(painter) {
      painters.current.add(painter)
      return () => painters.current.delete(painter)
    },
  })

  const paint = (at: number) => {
    const current = state.current
    const { samples, round, feed, size } = current.data
    if (size.width === 0 || size.height === 0) return
    const result = round?.result
    const now = result ? result.time : reduced ? current.data.now : current.data.now + Math.min(1_000, at - current.reportedAt)
    const window = chartWindow(now, round)
    // A settled round shows the line only up to the compared trade.
    const visible = visibleSamples(result ? samples.filter((sample) => sample.time <= result.time) : samples, window)
    const prices = visible.map((sample) => Number(sample.price))
    if (round) prices.push(Number(round.entryPrice))
    if (result) prices.push(Number(result.price))
    const target = targetRange(prices)
    if (!target) {
      const scale = makeScale(window, { low: 0, high: 1 }, size)
      painters.current.forEach((painter) => painter({ scale, now, round, visible, head: null, runs: [], gaps: [] }))
      return
    }
    current.range = stepRange(current.range, target, reduced ? 1 : 0.12)
    const scale = makeScale(window, current.range, size)

    const { runs: sampleRuns, gaps } = segments(visible, now, feed === 'stale' || feed === 'unavailable')
    const runs = sampleRuns.map((run) => run.map((sample): [number, number] => [scale.xOf(sample.time), scale.yOf(Number(sample.price))]))
    const last = visible[visible.length - 1]
    const lastRun = runs[runs.length - 1]
    let head: Frame['head'] = null
    if (last && lastRun && current.head && !result) {
      const value = reduced ? current.head.to : easedValue(current.head.from, current.head.to, current.head.startedAt, at)
      const time = headTime(last.time, now, feed === 'live')
      const x = scale.xOf(time)
      const y = scale.yOf(value)
      lastRun[lastRun.length - 1] = [scale.xOf(last.time), y]
      if (time > last.time) lastRun.push([x, y])
      head = { x, y, time, value, sample: last }
    }
    const frame: Frame = { scale, now, round, visible, head, runs, gaps }
    painters.current.forEach((painter) => painter(frame))
  }

  // New data: remember it, and start easing the head when the last quote changed.
  useLayoutEffect(() => {
    const current = state.current
    const last = data.samples[data.samples.length - 1]
    current.data = data
    current.reportedAt = performance.now()
    if (last && (!current.head || current.head.time !== last.time || current.head.to !== Number(last.price))) {
      const shown = current.head
        ? easedValue(current.head.from, current.head.to, current.head.startedAt, performance.now())
        : Number(last.price)
      current.head = { from: shown, to: Number(last.price), startedAt: performance.now(), time: last.time }
    }
    if (still || typeof requestAnimationFrame !== 'function') paint(performance.now())
  })

  const drawable = data.size.width > 0 && data.size.height > 0
  useLayoutEffect(() => {
    if (still || !drawable || typeof requestAnimationFrame !== 'function') return
    let id = 0
    const tick = (at: number) => {
      paint(at)
      id = requestAnimationFrame(tick)
    }
    const start = () => {
      cancelAnimationFrame(id)
      if (!document.hidden) id = requestAnimationFrame(tick)
    }
    start()
    document.addEventListener('visibilitychange', start)
    return () => {
      cancelAnimationFrame(id)
      document.removeEventListener('visibilitychange', start)
    }
    // paint reads everything through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [still, drawable])

  return registry.current
}
