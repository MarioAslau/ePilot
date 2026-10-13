import { ArrowDown, ArrowUp } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { formatTime, formatUsd } from '../format'
import type { Stance } from '../round'
import { place } from './dom'
import { usePainter } from './frame'
import { GAP_POOL } from './layers'
import { gridLines, PAD_TOP, xTicks, type ChartRound, type Readout, type SettledRound } from './model'

/** Past this share of the width the head tag sits left of the dot. */
const FLIP_AT = 0.55
/** A label hides or dims when the head tag comes this close to it vertically. */
const CLEARANCE = 22
/** The widest the head tag gets, for deciding whether it reaches the result label. */
const HEAD_TAG_WIDTH = 110
const EDGE = 8

const wholeUsd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/** Whether something at height `y` is crowded by any of these heights. */
function crowded(y: number, others: (number | null | undefined)[]): boolean {
  return others.some((other) => other !== null && other !== undefined && Math.abs(other - y) < CLEARANCE)
}

/** A tag beside the head dot, flipping to its left past `FLIP_AT` of the width. */
function HeadTag({ className, children }: { className: string; children: ReactNode }) {
  const tag = useRef<HTMLSpanElement>(null)
  usePainter(({ head, scale }) => {
    tag.current?.classList.toggle('flip', Boolean(head && head.x > scale.size.width * FLIP_AT))
    place(tag.current, head)
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
      place(label, to - from >= GAP_LABEL_MIN && { x: (from + to) / 2, y: scale.size.height / 2 })
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
 * It dims when the head tag or the compared tag is about to cover it.
 */
export function EntryTag({ round, at = 'end' }: { round: ChartRound; at?: 'start' | 'end' }) {
  const tag = useRef<HTMLSpanElement>(null)
  usePainter(({ scale, head, compared, entryY }) => {
    if (entryY === null) return place(tag.current, null)
    place(tag.current, { x: at === 'end' ? scale.size.width - EDGE : scale.xOf(round.acceptedAt), y: entryY })
    tag.current?.classList.toggle('dim', crowded(entryY, [head?.y, compared?.y]))
  })
  return <span ref={tag} className={`ch-tag ch-entry-tag ${at}`}>Entry {formatUsd(round.entryPrice)}</span>
}

/** The label at the top of the result line. It hides while the head tag passes through its row. */
export function ResultLabel({ round, now }: { round: ChartRound; now: number }) {
  const tag = useRef<HTMLSpanElement>(null)
  usePainter(({ scale, head }) => {
    const element = tag.current
    const x = scale.xOf(round.earliestResolveAt)
    place(element, { x, y: 0 })
    // The label sits left of the line, in the row above the plot.
    const left = x - (element?.offsetWidth ?? 0)
    const covered = head && head.y < PAD_TOP + CLEARANCE / 2 && head.x > left - HEAD_TAG_WIDTH && head.x < x + HEAD_TAG_WIDTH
    element?.classList.toggle('dim', Boolean(covered))
  })
  const text = now >= round.earliestResolveAt && !round.result ? 'Comparing since' : 'Result from'
  return <span ref={tag} className="ch-tag ch-result-label">{text} {formatTime(round.earliestResolveAt)}</span>
}

/** "↑ Up wins above" or "↓ Down wins below", just past the entry on the winning side. */
export function ZoneLabel({ round }: { round: ChartRound }) {
  const tag = useRef<HTMLSpanElement>(null)
  usePainter(({ scale, entryY }) => place(tag.current, entryY !== null && { x: scale.xOf(round.acceptedAt) + EDGE, y: entryY }))
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
  usePainter(({ scale, head, entryY }) => {
    const levels = gridLines(scale.range)
    labels.forEach((ref, index) => {
      const element = ref.current
      const level = levels[index]
      if (!element || level === undefined) return place(element, null)
      const y = scale.yOf(level)
      place(element, { x: scale.size.width - EDGE, y })
      element.textContent = wholeUsd.format(level)
      element.classList.toggle('dim', crowded(y, [head?.y, entryY]))
    })
  })
  return <>{labels.map((ref, index) => <span key={index} ref={ref} className="ch-tag ch-grid-label" />)}</>
}

/** Time labels under the plot, kept inside the chart's edges. */
export function Ticks({ round }: { round?: ChartRound }) {
  const ticks = useRef<(HTMLSpanElement | null)[]>([])
  usePainter(({ scale, now }) => {
    xTicks(now, round).forEach((tick, index) => {
      const element = ticks.current[index]
      const half = (element?.offsetWidth ?? 0) / 2
      place(element, { x: Math.min(scale.size.width - EDGE - half, Math.max(EDGE + half, scale.xOf(tick.time))), y: scale.size.height })
    })
  })
  // Only the labels are rendered here; their positions follow the clock in the painter.
  return (
    <>
      {xTicks(0, round).map((tick, index) => (
        <span key={index} ref={(element) => { ticks.current[index] = element }} className="ch-tag ch-tick">{tick.label}</span>
      ))}
    </>
  )
}

/** "Compared $X · HH:MM:SS" beside the compared marker, on its left because the marker sits near the right edge. */
export function ComparedTag({ round, withTime = true }: { round: SettledRound; withTime?: boolean }) {
  const tag = useRef<HTMLSpanElement>(null)
  usePainter(({ compared }) => place(tag.current, compared))
  const { price, time, outcome } = round.result
  return (
    <span ref={tag} className={`ch-tag ch-compared-tag ${outcome === 'WIN' ? 'win' : 'loss'}`}>
      Compared {formatUsd(price)}{withTime ? ` · ${formatTime(time)}` : ''}
    </span>
  )
}

/** The scrub tooltip: price, time, and the move against the entry. Kept inside the chart. */
export function ScrubTooltip({ sample, readout }: { sample: { time: number } | null; readout: Readout | null }) {
  const tip = useRef<HTMLDivElement>(null)
  usePainter(({ scale }) => {
    const element = tip.current
    const shown = sample && readout && sample.time >= scale.window.start && sample.time <= scale.window.end
    const width = element?.offsetWidth ?? 0
    place(element, shown && { x: Math.min(scale.size.width - width - EDGE, Math.max(EDGE, scale.xOf(sample.time) - width / 2)), y: 0 })
  })
  const vs = readout?.vs
  const Arrow = vs && vs !== 'before' && vs.up !== null ? (vs.up ? ArrowUp : ArrowDown) : null
  return (
    <div ref={tip} className="ch-tip">
      {readout && (
        <>
          <b className="num">{readout.price}</b> <span>{readout.time}</span>
          {vs === 'before' && <span className="ch-tip-vs">Before your entry</span>}
          {vs && vs !== 'before' && (
            <span className={`ch-tip-vs stance ${vs.tone}`}>
              {Arrow && <Arrow className="ic" size={12} aria-hidden="true" />} {vs.amount} vs entry
            </span>
          )}
        </>
      )}
    </div>
  )
}
