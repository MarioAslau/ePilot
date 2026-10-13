import type { FeedStatus } from '../market'
import { stance } from '../round'
import { FrameProvider, useChartFrame } from './frame'
import { ComparedMarker, EntryLine, GapHatch, GridLines, HeadDot, PriceLine, RoundMarks, Zones } from './layers'
import { holdLabel, isSettled, winningSide, type ChartRound } from './model'
import { ComparedTag, EntryTag, GapLabels, GridLabels, HoldTag, PriceTag, ResultLabel, Ticks, ZoneLabel } from './Tags'
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
  feed,
}: {
  samples: PriceSample[]
  now: number
  round?: ChartRound
  feed: FeedStatus
}) {
  const { ref, size } = useChartSize<HTMLDivElement>()
  const reduced = useReducedMotion()
  const frame = useChartFrame({ samples, now, round, feed, size }, reduced)

  const latest = samples[samples.length - 1]
  const tone = round && latest ? stance(round.direction, round.entryPrice, latest.price).tone : 'idle'
  const hold = holdLabel(round)

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
          <GapHatch />
          {round && <Zones win={winningSide(round.direction)} />}
          <RoundMarks />
          <EntryLine />
          <PriceLine />
          <HeadDot />
          <ComparedMarker />
        </svg>
        <div className="ch-overlay" aria-hidden="true">
          <GridLabels />
          <GapLabels />
          {round && <ZoneLabel round={round} />}
          {round && <EntryTag round={round} />}
          {round && <ResultLabel round={round} now={now} />}
          {isSettled(round)
            ? <ComparedTag round={round} />
            : latest && (hold ? <HoldTag {...hold} /> : <PriceTag price={latest.price} tone={tone} />)}
          <Ticks key={round ? 'round' : 'idle'} round={round} />
        </div>
      </FrameProvider>
      {!round && samples.length < 2 && <div className="spark-note">Collecting recent prices</div>}
    </div>
  )
}
