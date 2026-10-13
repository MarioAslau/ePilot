import { stance } from '../round'
import { FrameProvider, useChartFrame } from './frame'
import { EntryLine, GridLines, HeadDot, PriceLine, RoundMarks, Zones } from './layers'
import { winningSide, type ChartRound } from './model'
import { EntryTag, GridLabels, PriceTag, ResultLabel, Ticks, ZoneLabel } from './Tags'
import type { PriceSample } from './samples'
import { useChartSize } from './useChartSize'
import { useReducedMotion } from './useReducedMotion'

export type { ChartRound }

/**
 * The stage chart. It mounts once; a frame loop moves its layers through refs.
 * Every time is server time.
 */
export function PriceChart({
  samples,
  now,
  round,
  live,
}: {
  samples: PriceSample[]
  now: number
  round?: ChartRound
  live: boolean
}) {
  const { ref, size } = useChartSize<HTMLDivElement>()
  const reduced = useReducedMotion()
  const frame = useChartFrame({ samples, now, round, live, size }, reduced)

  const latest = samples[samples.length - 1]
  const tone = round && latest ? stance(round.direction, round.entryPrice, latest.price).tone : 'idle'

  return (
    <div className="spark" ref={ref}>
      <FrameProvider value={frame}>
        <svg
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label="BTC/USD price chart"
        >
          <GridLines />
          {round && <Zones win={winningSide(round.direction)} />}
          <RoundMarks />
          <EntryLine />
          <PriceLine />
          <HeadDot />
        </svg>
        <div className="ch-overlay" aria-hidden="true">
          <GridLabels />
          {round && <ZoneLabel round={round} />}
          {round && <EntryTag round={round} />}
          {round && <ResultLabel round={round} now={now} />}
          {latest && <PriceTag price={latest.price} tone={tone} />}
          <Ticks key={round ? 'round' : 'idle'} round={round} />
        </div>
      </FrameProvider>
      {!round && samples.length < 2 && <div className="spark-note">Collecting recent prices</div>}
    </div>
  )
}
