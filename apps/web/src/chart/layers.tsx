import { useId, useRef, type RefObject } from 'react'
import { usePainter, type Frame } from './frame'
import { gridLines, pointsFrom } from './model'

function pathOf(run: [number, number][]): string {
  return run.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
}

/** The price line, drawn through the eased head, broken at every gap. */
export function PriceLine() {
  const line = useRef<SVGPathElement>(null)
  usePainter(({ runs }) => {
    line.current?.setAttribute('d', runs.filter((run) => run.length).map(pathOf).join(' '))
  })
  return <path ref={line} className="ch-line" />
}

/** Where the head dot is drawn. On an unchanged price it sits on the entry line, which is what the server compared. */
export function headPoint({ head, round, scale }: Frame): { x: number; y: number } | null {
  if (!head) return null
  if (round?.waitReason === 'EQUAL_PRICE') return { x: head.x, y: scale.yOf(Number(round.entryPrice)) }
  return head
}

/** The dot at the head of the line. It is muted while the round is on hold. */
export function HeadDot() {
  const dot = useRef<SVGCircleElement>(null)
  usePainter((frame) => {
    const element = dot.current
    if (!element) return
    const point = headPoint(frame)
    element.style.display = point ? '' : 'none'
    element.classList.toggle('hold', frame.round?.waitReason === 'PROVIDER_HOLD')
    if (point) element.setAttribute('transform', `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`)
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
      if (!rect) return
      const gap = gaps[index]
      rect.style.display = gap ? '' : 'none'
      if (!gap) return
      const x = scale.xOf(gap.from)
      rect.setAttribute('x', x.toFixed(1))
      rect.setAttribute('width', Math.max(0, scale.xOf(gap.to) - x).toFixed(1))
      rect.setAttribute('height', String(scale.size.height))
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
        <rect key={index} ref={(element) => { rects.current[index] = element }} className="ch-gap" y="0" fill={`url(#${id}-hatch)`} data-gap="" />
      ))}
    </>
  )
}

/** Vertical marks at the entry and at the earliest result time. */
export function RoundMarks() {
  const entry = useRef<SVGLineElement>(null)
  const result = useRef<SVGLineElement>(null)
  usePainter(({ scale, round }) => {
    const pairs: [SVGLineElement | null, number | undefined][] = [
      [entry.current, round?.acceptedAt],
      [result.current, round?.earliestResolveAt],
    ]
    pairs.forEach(([element, time]) => {
      if (!element) return
      element.style.display = time === undefined ? 'none' : ''
      if (time === undefined) return
      const x = scale.xOf(time).toFixed(1)
      element.setAttribute('x1', x)
      element.setAttribute('x2', x)
      element.setAttribute('y2', String(scale.size.height))
    })
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
  usePainter(({ scale, round }) => {
    const element = line.current
    if (!element) return
    element.style.display = round ? '' : 'none'
    if (!round) return
    const y = scale.yOf(Number(round.entryPrice)).toFixed(1)
    element.setAttribute('x1', scale.xOf(round.acceptedAt).toFixed(1))
    element.setAttribute('x2', String(scale.size.width))
    element.setAttribute('y1', y)
    element.setAttribute('y2', y)
  })
  return <line ref={line} className="ch-entry" />
}

/**
 * The area between the line after the entry and the entry price, split at the entry line:
 * the winning side green, the losing side red, fading from 22 % at the line to 5 % at the entry.
 */
export function Zones({ win }: { win: 'above' | 'below' }) {
  const id = useId().replace(/:/g, '')
  const above = useRef<SVGPathElement>(null)
  const below = useRef<SVGPathElement>(null)
  const clipAbove = useRef<SVGRectElement>(null)
  const clipBelow = useRef<SVGRectElement>(null)
  const fadeAbove = useRef<SVGLinearGradientElement>(null)
  const fadeBelow = useRef<SVGLinearGradientElement>(null)
  usePainter(({ scale, round, runs }) => {
    const areas = round ? runs.map((run) => pointsFrom(run, scale.xOf(round.acceptedAt))).filter((area) => area.length >= 2) : []
    const shown = areas.length > 0 && round
    for (const path of [above.current, below.current]) {
      if (!path) continue
      path.style.display = shown ? '' : 'none'
    }
    if (!shown) return
    const { width, height } = scale.size
    const entryY = scale.yOf(Number(round.entryPrice))
    const d = areas.map((area) => {
      const first = area[0]!
      const last = area[area.length - 1]!
      return `M${first[0].toFixed(1)},${entryY.toFixed(1)} ${area.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} L${last[0].toFixed(1)},${entryY.toFixed(1)}Z`
    }).join(' ')
    above.current?.setAttribute('d', d)
    below.current?.setAttribute('d', d)
    clipAbove.current?.setAttribute('width', String(width))
    clipAbove.current?.setAttribute('height', String(Math.max(0, entryY)))
    clipBelow.current?.setAttribute('width', String(width))
    clipBelow.current?.setAttribute('y', String(entryY))
    clipBelow.current?.setAttribute('height', String(Math.max(0, height - entryY)))
    fadeAbove.current?.setAttribute('y2', String(entryY))
    fadeBelow.current?.setAttribute('y1', String(height))
    fadeBelow.current?.setAttribute('y2', String(entryY))
  })
  const side = (name: 'above' | 'below') => (name === win ? 'win' : 'lose')
  const fade = (ref: RefObject<SVGLinearGradientElement>, name: 'above' | 'below') => (
    <linearGradient ref={ref} id={`${id}-fade-${name}`} className={`ch-fade ${side(name)}`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="0">
      <stop offset="0" stopOpacity="0.22" />
      <stop offset="1" stopOpacity="0.05" />
    </linearGradient>
  )
  return (
    <>
      <defs>
        <clipPath id={`${id}-above`}><rect ref={clipAbove} x="0" y="0" /></clipPath>
        <clipPath id={`${id}-below`}><rect ref={clipBelow} x="0" /></clipPath>
        {fade(fadeAbove, 'above')}
        {fade(fadeBelow, 'below')}
      </defs>
      <path ref={above} className={`ch-zone ${side('above')}`} data-zone={side('above')} data-side="above" clipPath={`url(#${id}-above)`} fill={`url(#${id}-fade-above)`} />
      <path ref={below} className={`ch-zone ${side('below')}`} data-zone={side('below')} data-side="below" clipPath={`url(#${id}-below)`} fill={`url(#${id}-fade-below)`} />
    </>
  )
}

/** Two light horizontal gridlines at round prices. Their labels are HTML, in `GridLabels`. */
export function GridLines() {
  const lines = [useRef<SVGLineElement>(null), useRef<SVGLineElement>(null)]
  usePainter(({ scale }) => {
    const levels = gridLines(scale.range)
    lines.forEach((ref, index) => {
      const element = ref.current
      if (!element) return
      const level = levels[index]
      element.style.display = level === undefined ? 'none' : ''
      if (level === undefined) return
      const y = scale.yOf(level).toFixed(1)
      element.setAttribute('x2', String(scale.size.width))
      element.setAttribute('y1', y)
      element.setAttribute('y2', y)
    })
  })
  return <>{lines.map((ref, index) => <line key={index} ref={ref} className="ch-grid" x1="0" />)}</>
}

/** Where the compared trade sits, once the round has settled. */
export function comparedPoint({ round, scale }: Frame): { x: number; y: number; entryY: number } | null {
  const result = round?.result
  if (!result) return null
  return { x: scale.xOf(result.time), y: scale.yOf(Number(result.price)), entryY: scale.yOf(Number(round.entryPrice)) }
}

/** The compared trade as a filled marker, and a bracket from the entry price to it, in the outcome colour. */
export function ComparedMarker() {
  const dot = useRef<SVGCircleElement>(null)
  const bracket = useRef<SVGPathElement>(null)
  usePainter((frame) => {
    const point = comparedPoint(frame)
    for (const element of [dot.current, bracket.current]) {
      if (element) element.style.display = point ? '' : 'none'
    }
    if (!point) return
    const outcome = frame.round?.result?.outcome === 'WIN' ? 'win' : 'loss'
    for (const element of [dot.current, bracket.current]) {
      element?.classList.toggle('win', outcome === 'win')
      element?.classList.toggle('loss', outcome === 'loss')
    }
    dot.current?.setAttribute('transform', `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`)
    const x = point.x + BRACKET_OFFSET
    bracket.current?.setAttribute(
      'd',
      `M${(x - 3).toFixed(1)},${point.entryY.toFixed(1)} H${x.toFixed(1)} V${point.y.toFixed(1)} H${(x - 3).toFixed(1)}`,
    )
  })
  return (
    <>
      <path ref={bracket} className="ch-bracket" />
      <circle ref={dot} className="ch-compared" r="5" data-compared="" />
    </>
  )
}

const BRACKET_OFFSET = 9

/** With no samples for a settled round: a dashed straight line from the entry to the compared trade, not a series. */
export function TwoPointConnector() {
  const line = useRef<SVGLineElement>(null)
  const entry = useRef<SVGCircleElement>(null)
  usePainter((frame) => {
    const point = comparedPoint(frame)
    const from = frame.round ? { x: frame.scale.xOf(frame.round.acceptedAt), y: point?.entryY ?? 0 } : null
    for (const element of [line.current, entry.current]) {
      if (element) element.style.display = point && from ? '' : 'none'
    }
    if (!point || !from) return
    line.current?.setAttribute('x1', from.x.toFixed(1))
    line.current?.setAttribute('y1', from.y.toFixed(1))
    line.current?.setAttribute('x2', point.x.toFixed(1))
    line.current?.setAttribute('y2', point.y.toFixed(1))
    entry.current?.setAttribute('transform', `translate(${from.x.toFixed(1)} ${from.y.toFixed(1)})`)
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
    for (const element of [line.current, dot.current]) {
      if (element) element.style.display = shown ? '' : 'none'
    }
    if (!shown) return
    const x = scale.xOf(sample.time).toFixed(1)
    line.current?.setAttribute('x1', x)
    line.current?.setAttribute('x2', x)
    line.current?.setAttribute('y2', String(scale.size.height))
    dot.current?.setAttribute('transform', `translate(${x} ${scale.yOf(Number(sample.price)).toFixed(1)})`)
  })
  return (
    <>
      <line ref={line} className="ch-cross" y1="0" />
      <circle ref={dot} className="ch-cross-dot" r="3.5" />
    </>
  )
}
