import { createContext, useContext, useLayoutEffect, useRef } from 'react'
import type { FeedStatus } from '../market'
import { buildFrame, viewAt, type Frame } from './buildFrame'
import { easedValue, makeScale, stepRange, type ChartRound, type Range, type Size } from './model'
import type { PriceSample } from './samples'

export type { Frame }
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

/** Keeps the latest frame in a ref, for event handlers that need the current scale. */
export function useLastFrame(registry: Registry) {
  const last = useRef<Frame | null>(null)
  useLayoutEffect(() => registry.register((frame) => { last.current = frame }), [registry])
  return last
}

/**
 * Drives the chart. With motion it runs a requestAnimationFrame loop while the page is visible:
 * the clock scrolls smoothly, a new quote eases in over 450 ms, and the y range eases toward its target.
 * With reduced motion, or for a settled round, it paints once per data change with no easing.
 * Nothing runs while the chart has no size. The geometry itself is `buildFrame`; this hook only owns the motion.
 */
export function useChartFrame(data: ChartData, reduced: boolean): Registry {
  const animated = !reduced && !data.round?.result && typeof requestAnimationFrame === 'function'
  const drawable = data.size.width > 0 && data.size.height > 0
  const painters = useRef(new Set<Painter>())
  const motion = useRef({
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
    const current = motion.current
    const { samples, round, feed, size, now } = current.data
    if (size.width === 0 || size.height === 0) return
    const view = viewAt(samples, animated ? now + Math.min(1_000, at - current.reportedAt) : now, round)
    const frame = view.target
      ? buildFrame(view, {
        round,
        feed,
        size,
        range: (current.range = stepRange(current.range, view.target, animated ? 0.12 : 1)),
        headValue: current.head ? (animated ? easedValue(current.head.from, current.head.to, current.head.startedAt, at) : current.head.to) : null,
      })
      : { scale: makeScale(view.window, { low: 0, high: 1 }, size), now: view.now, round, visible: [], runs: [], gaps: [], head: null, entryY: null, compared: null }
    painters.current.forEach((painter) => painter(frame))
  }

  // New data: remember it, and start easing the head when the last quote changed.
  useLayoutEffect(() => {
    const current = motion.current
    const at = performance.now()
    const last = data.samples[data.samples.length - 1]
    current.data = data
    current.reportedAt = at
    if (last && (!current.head || current.head.time !== last.time || current.head.to !== Number(last.price))) {
      const shown = current.head ? easedValue(current.head.from, current.head.to, current.head.startedAt, at) : Number(last.price)
      current.head = { from: shown, to: Number(last.price), startedAt: at, time: last.time }
    }
    if (!animated) paint(at)
  })

  useLayoutEffect(() => {
    if (!animated || !drawable) return
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
  }, [animated, drawable])

  return registry.current
}
