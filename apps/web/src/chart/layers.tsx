import type { Outcome } from 'contracts'
import { useId, useRef } from 'react'
import { at, draw } from './dom'
import { usePainter } from './frame'
import { gridLines, pointsFrom } from './model'

function pathOf(run: [number, number][]): string {
  return run.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

/** The price line, drawn through the eased head, broken at every gap. */
export function PriceLine() {
  const line = useRef<SVGPathElement>(null)
  usePainter(({ runs }) => draw(line.current, { d: runs.filter((run) => run.length).map(pathOf).join(' ') }))
  return <path ref={line} className="ch-line" />
}

/** The dot at the head of the line. It is muted while the round is on hold. */
export function HeadDot() {
  const dot = useRef<SVGCircleElement>(null)
  usePainter(({ head, round }) => {
    draw(dot.current, head && at(head.x, head.y))
    dot.current?.classList.toggle('hold', round?.waitReason === 'PROVIDER_HOLD')
  })
  return <circle ref={dot} className="ch-head" r="5" />
}

/** At most this many gaps are hatched at once; a two-minute window rarely has more than one or two. */
export const GAP_POOL = 4

/** Diagonal hatching over every span with no price data. Labels are HTML, in `GapLabels`. */
export function GapHatch() {
  const id = useId().replace(/:/g, '')
  const rects = useRef<(SVGRectElement | null)[]>([])
  usePainter(({ gaps, scale }) => {
    rects.current.forEach((rect, index) => {
      const gap = gaps[index]
      draw(rect, gap && {
        x: scale.xOf(gap.from),
        width: Math.max(0, scale.xOf(gap.to) - scale.xOf(gap.from)),
        height: scale.size.height,
      })
    })
  })
  return (
    <>
      <defs>
        <pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line className="ch-hatch-line" x1="0" y1="0" x2="0" y2="6" />
        </pattern>
      </defs>
      {Array.from({ length: GAP_POOL }, (_, index) => (
        <rect key={index} ref={(element) => { rects.current[index] = element }} className="ch-gap" y="0" fill={`url(#${id}-hatch)`} />
      ))}
    </>
  )
}

/** Vertical marks at the entry and at the earliest result time. */
export function RoundMarks() {
  const entry = useRef<SVGLineElement>(null)
  const result = useRef<SVGLineElement>(null)
  usePainter(({ scale, round }) => {
    const mark = (time: number) => ({ x1: scale.xOf(time), x2: scale.xOf(time), y2: scale.size.height })
    draw(entry.current, round && mark(round.acceptedAt))
    draw(result.current, round && mark(round.earliestResolveAt))
  })
  return (
    <>
      <line ref={entry} className="ch-entry-mark" y1="0" />
      <line ref={result} className="ch-result-mark" y1="0" />
    </>
  )
}

/** The dashed entry price line, from the entry to the right edge. */
export function EntryLine() {
  const line = useRef<SVGLineElement>(null)
  usePainter(({ scale, round, entryY }) => {
    draw(line.current, round && entryY !== null && { x1: scale.xOf(round.acceptedAt), x2: scale.size.width, y1: entryY, y2: entryY })
  })
  return <line ref={line} className="ch-entry" />
}

/**
 * One side of the entry line: the area between the line after the entry and the entry price, clipped to this side
 * and fading from 22 % at the far edge to 5 % at the entry. The winning side is green, the losing side red.
 */
function ZoneSide({ side, win }: { side: 'above' | 'below'; win: boolean }) {
  const id = useId().replace(/:/g, '')
  const area = useRef<SVGPathElement>(null)
  const clip = useRef<SVGRectElement>(null)
  const fade = useRef<SVGLinearGradientElement>(null)
  usePainter(({ scale, round, runs, entryY }) => {
    const areas = round && entryY !== null
      ? runs.map((run) => pointsFrom(run, scale.xOf(round.acceptedAt))).filter((points) => points.length >= 2)
      : []
    if (!areas.length || entryY === null) {
      draw(area.current, null)
      return
    }
    const { width, height } = scale.size
    const edge = side === 'above' ? 0 : height
    draw(area.current, {
      d: areas.map((points) => {
        const first = points[0]!
        const last = points[points.length - 1]!
        return `M${first[0].toFixed(1)},${entryY.toFixed(1)} ${pathOf(points).replace(/^M/, 'L')} L${last[0].toFixed(1)},${entryY.toFixed(1)}Z`
      }).join(' '),
    })
    draw(clip.current, { y: Math.min(edge, entryY), width, height: Math.abs(entryY - edge) })
    draw(fade.current, { y1: edge, y2: entryY })
  })
  const outcome = win ? 'win' : 'lose'
  return (
    <>
      <defs>
        <clipPath id={`${id}-clip`}><rect ref={clip} x="0" /></clipPath>
        <linearGradient ref={fade} id={`${id}-fade`} className={`ch-fade ${outcome}`} gradientUnits="userSpaceOnUse" x1="0" x2="0">
          <stop offset="0" stopOpacity="0.22" />
          <stop offset="1" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path ref={area} className={`ch-zone ${outcome}`} data-zone={outcome} data-side={side} clipPath={`url(#${id}-clip)`} fill={`url(#${id}-fade)`} />
    </>
  )
}

/** Both sides of the entry line: the winning one green, the losing one red. */
export function Zones({ win }: { win: 'above' | 'below' }) {
  return (
    <>
      <ZoneSide side="above" win={win === 'above'} />
      <ZoneSide side="below" win={win === 'below'} />
    </>
  )
}

/** Two light horizontal gridlines at round prices. Their labels are HTML, in `GridLabels`. */
export function GridLines() {
  const lines = [useRef<SVGLineElement>(null), useRef<SVGLineElement>(null)]
  usePainter(({ scale }) => {
    const levels = gridLines(scale.range)
    lines.forEach((ref, index) => {
      const level = levels[index]
      draw(ref.current, level !== undefined && { x2: scale.size.width, y1: scale.yOf(level), y2: scale.yOf(level) })
    })
  })
  return <>{lines.map((ref, index) => <line key={index} ref={ref} className="ch-grid" x1="0" />)}</>
}

const BRACKET_OFFSET = 9

/** The compared trade as a filled marker, and a bracket from the entry price to it, in the outcome colour. */
export function ComparedMarker({ outcome }: { outcome: Outcome }) {
  const tone = outcome === 'WIN' ? 'win' : 'loss'
  const dot = useRef<SVGCircleElement>(null)
  const bracket = useRef<SVGPathElement>(null)
  usePainter(({ compared, entryY }) => {
    const x = compared ? compared.x + BRACKET_OFFSET : 0
    draw(dot.current, compared && at(compared.x, compared.y))
    draw(bracket.current, compared && entryY !== null && { d: `M${x - 3},${entryY} H${x} V${compared.y} H${x - 3}` })
  })
  return (
    <>
      <path ref={bracket} className={`ch-bracket ${tone}`} />
      <circle ref={dot} className={`ch-compared ${tone}`} r="5" data-compared="" />
    </>
  )
}

/** With no samples for a settled round: a dashed straight line from the entry to the compared trade, not a series. */
export function TwoPointConnector() {
  const line = useRef<SVGLineElement>(null)
  const entry = useRef<SVGCircleElement>(null)
  usePainter(({ scale, round, compared, entryY }) => {
    const from = round && entryY !== null && compared ? { x: scale.xOf(round.acceptedAt), y: entryY } : null
    draw(line.current, from && compared && { x1: from.x, y1: from.y, x2: compared.x, y2: compared.y })
    draw(entry.current, from && at(from.x, from.y))
  })
  return (
    <>
      <line ref={line} className="ch-connector" />
      <circle ref={entry} className="ch-entry-dot" r="4" />
    </>
  )
}

/** A vertical crosshair and a 7 px dot on the scrubbed sample. */
export function Crosshair({ sample }: { sample: { price: string; time: number } | null }) {
  const line = useRef<SVGLineElement>(null)
  const dot = useRef<SVGCircleElement>(null)
  usePainter(({ scale }) => {
    const shown = sample && sample.time >= scale.window.start && sample.time <= scale.window.end
    const x = shown ? scale.xOf(sample.time) : 0
    draw(line.current, shown && { x1: x, x2: x, y2: scale.size.height })
    draw(dot.current, shown && at(x, scale.yOf(Number(sample.price))))
  })
  return (
    <>
      <line ref={line} className="ch-cross" y1="0" />
      <circle ref={dot} className="ch-cross-dot" r="3.5" />
    </>
  )
}
