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
