import { ArrowDown, ArrowUp } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { formatTime, formatUsd } from '../format'
import type { Stance } from '../round'
import { usePainter } from './frame'
import { comparedPoint, GAP_POOL, headPoint } from './layers'
import { gridLines, xTicks, type ChartRound, type SettledRound } from './model'

/** Past this share of the width the price tag sits left of the head dot. */
const FLIP_AT = 0.55
/** A label dims when the price tag comes this close to it vertically. */
const CLEARANCE = 22
/** How far left of the result line its label reaches, roughly. */
const RESULT_LABEL_REACH = 170
const EDGE = 8

const wholeUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function place(element: HTMLElement | null, x: number, y: number, shown = true) {
  if (!element) return
  element.style.display = shown ? '' : 'none'
  if (shown) element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
}

/** A tag beside the head dot, flipping to its left past `FLIP_AT` of the width. */
function HeadTag({ className, children }: { className: string; children: ReactNode }) {
  const tag = useRef<HTMLSpanElement>(null)
  usePainter((frame) => {
    const point = headPoint(frame)
    tag.current?.classList.toggle('flip', point ? point.x > frame.scale.size.width * FLIP_AT : false)
    place(tag.current, point?.x ?? 0, point?.y ?? 0, Boolean(point))
  })
  return <span ref={tag} className={`ch-tag ${className}`}>{children}</span>
}

/** The latest real price beside the head dot. Never the eased value. */
export function PriceTag({ price, tone }: { price: string; tone: Stance | 'idle' }) {
  return <HeadTag className={`ch-price ${tone}`}>{formatUsd(price)}</HeadTag>
}

/** "Level · still waiting" or "On hold · not a loss" in place of the price tag. */
export function HoldTag({ text, kind }: { text: string; kind: 'level' | 'hold' }) {
  return <HeadTag className={`ch-hold-tag ${kind}`}>{text}</HeadTag>
}

/** Below this width a gap is hatched but not labelled. */
const GAP_LABEL_MIN = 40

/** "No price data" centred over each gap wide enough to hold it. */
export function GapLabels() {
  const labels = useRef<(HTMLSpanElement | null)[]>([])
  usePainter(({ gaps, scale }) => {
    labels.current.forEach((label, index) => {
      const gap = gaps[index]
      const from = gap ? scale.xOf(gap.from) : 0
      const to = gap ? scale.xOf(gap.to) : 0
      place(label, (from + to) / 2, scale.size.height / 2, Boolean(gap) && to - from >= GAP_LABEL_MIN)
    })
  })
  return (
    <>
      {Array.from({ length: GAP_POOL }, (_, index) => (
        <span key={index} ref={(element) => { labels.current[index] = element }} className="ch-tag ch-gap-label">No price data</span>
      ))}
    </>
  )
}

/**
 * "Entry $X" at the right end of the entry line, or at its start in the small receipt chart.
 * It fades when the price tag or the compared tag is about to cover it.
 */
export function EntryTag({ round, at = 'end' }: { round: ChartRound; at?: 'start' | 'end' }) {
  const tag = useRef<HTMLSpanElement>(null)
  usePainter((frame) => {
    const { scale, head } = frame
    const y = scale.yOf(Number(round.entryPrice))
    const compared = comparedPoint(frame)
    place(tag.current, at === 'end' ? scale.size.width - EDGE : scale.xOf(round.acceptedAt), y)
    const near = (other?: number) => other !== undefined && Math.abs(other - y) < CLEARANCE
    tag.current?.classList.toggle('dim', near(head?.y) || near(compared?.y))
  })
  return <span ref={tag} className={`ch-tag ch-entry-tag ${at}`}>Entry {formatUsd(round.entryPrice)}</span>
}

/** The label at the top of the result line. */
export function ResultLabel({ round, now }: { round: ChartRound; now: number }) {
  const tag = useRef<HTMLSpanElement>(null)
  usePainter(({ scale, head }) => {
    const x = scale.xOf(round.earliestResolveAt)
    place(tag.current, x, 0)
    const covered = head && head.y < CLEARANCE * 1.5 && head.x > x - RESULT_LABEL_REACH - 80 && head.x < x + 80
    tag.current?.classList.toggle('dim', Boolean(covered))
  })
  const text = now >= round.earliestResolveAt && !round.result ? 'Comparing since' : 'Result from'
  return <span ref={tag} className="ch-tag ch-result-label">{text} {formatTime(round.earliestResolveAt)}</span>
}

/** "↑ Up wins above" or "↓ Down wins below", just past the entry on the winning side. */
export function ZoneLabel({ round }: { round: ChartRound }) {
  const tag = useRef<HTMLSpanElement>(null)
  usePainter(({ scale }) => place(tag.current, scale.xOf(round.acceptedAt) + EDGE, scale.yOf(Number(round.entryPrice))))
  const up = round.direction === 'UP'
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <span ref={tag} className={`ch-tag ch-zone-label ${up ? 'above' : 'below'}`}>
      <Icon className={`ic ${up ? 'up-t' : 'down-t'}`} size={12} strokeWidth={2.4} aria-hidden="true" />
      {up ? 'Up wins above' : 'Down wins below'}
    </span>
  )
}

/** Right-aligned prices on the two gridlines. The text follows the eased range, so it is written each frame. */
export function GridLabels() {
  const labels = [useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null)]
  usePainter(({ scale, head, round }) => {
    const levels = gridLines(scale.range)
    const entryY = round ? scale.yOf(Number(round.entryPrice)) : null
    labels.forEach((ref, index) => {
      const element = ref.current
      const level = levels[index]
      place(element, scale.size.width - EDGE, level === undefined ? 0 : scale.yOf(level), level !== undefined)
      if (!element || level === undefined) return
      element.textContent = wholeUsd.format(level)
      const y = scale.yOf(level)
      const crowded = (head && Math.abs(head.y - y) < CLEARANCE) || (entryY !== null && Math.abs(entryY - y) < CLEARANCE)
      element.classList.toggle('dim', Boolean(crowded))
    })
  })
  return <>{labels.map((ref, index) => <span key={index} ref={ref} className="ch-tag ch-grid-label" />)}</>
}

/** Time labels under the plot, kept inside the chart's edges. */
export function Ticks({ round }: { round?: ChartRound }) {
  const ticks = [useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null), useRef<HTMLSpanElement>(null)]
  const labels = xTicks(0, round).map((tick) => tick.label)
  usePainter(({ scale, now }) => {
    xTicks(now, round).forEach((tick, index) => {
      const element = ticks[index]?.current
      if (!element) return
      const half = element.offsetWidth / 2
      const x = Math.min(scale.size.width - EDGE - half, Math.max(EDGE + half, scale.xOf(tick.time)))
      place(element, x, scale.size.height)
    })
  })
  return <>{labels.map((label, index) => <span key={label} ref={ticks[index]} className="ch-tag ch-tick">{label}</span>)}</>
}

/** "Compared $X · HH:MM:SS" beside the compared marker, on its left because the marker sits near the right edge. */
export function ComparedTag({ round, withTime = true }: { round: SettledRound; withTime?: boolean }) {
  const tag = useRef<HTMLSpanElement>(null)
  usePainter((frame) => {
    const point = comparedPoint(frame)
    place(tag.current, point?.x ?? 0, point?.y ?? 0, Boolean(point))
  })
  const { price, time, outcome } = round.result
  return (
    <span ref={tag} className={`ch-tag ch-compared-tag ${outcome === 'WIN' ? 'win' : 'loss'}`}>
      Compared {formatUsd(price)}{withTime ? ` · ${formatTime(time)}` : ''}
    </span>
  )
}
