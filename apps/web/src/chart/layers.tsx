import { useRef } from 'react'
import { usePainter } from './frame'

/** The price line, drawn through the eased head. */
export function PriceLine() {
  const line = useRef<SVGPolylineElement>(null)
  usePainter(({ points }) => {
    line.current?.setAttribute('points', points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '))
  })
  return <polyline ref={line} className="ch-line" />
}

/** The dot at the head of the line. */
export function HeadDot() {
  const dot = useRef<SVGCircleElement>(null)
  usePainter(({ head }) => {
    const element = dot.current
    if (!element) return
    element.style.display = head ? '' : 'none'
    if (head) element.setAttribute('transform', `translate(${head.x.toFixed(1)} ${head.y.toFixed(1)})`)
  })
  return <circle ref={dot} className="ch-head" r="5" />
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
