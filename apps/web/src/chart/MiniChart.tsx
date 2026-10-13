import { formatUsd } from '../format'
import { FrameProvider, useChartFrame } from './frame'
import { ComparedMarker, EntryLine, PriceLine, TwoPointConnector, Zones } from './layers'
import { settledSamples, winningSide, type SettledRound } from './model'
import type { PriceSample } from './samples'
import { ComparedTag, EntryTag } from './Tags'
import { useChartSize } from './useChartSize'

/**
 * The receipt's 72 px copy of the frozen result chart. Its only labels are the two price tags.
 * With no samples for the round, it draws just the entry and the compared trade, so it never looks like a series.
 */
export function MiniChart({ round, samples }: { round: SettledRound; samples: PriceSample[] }) {
  const { ref, size } = useChartSize<HTMLDivElement>()
  const series = settledSamples(samples, round)
  const frame = useChartFrame({ samples: series, now: round.result.time, round, feed: 'live', size }, true)
  const twoPoint = series.length === 0
  return (
    <figure className="mini-chart">
      <div className="spark mini" ref={ref}>
        <FrameProvider value={frame}>
          <svg
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            role="img"
            aria-label={`Entry ${formatUsd(round.entryPrice)}, compared ${formatUsd(round.result.price)}`}
          >
            {!twoPoint && <Zones win={winningSide(round.direction)} />}
            <EntryLine />
            {twoPoint ? <TwoPointConnector /> : <PriceLine />}
            <ComparedMarker />
          </svg>
          <div className="ch-overlay" aria-hidden="true">
            <EntryTag round={round} at="start" />
            <ComparedTag round={round} withTime={false} />
          </div>
        </FrameProvider>
      </div>
      {twoPoint && <figcaption className="fine">Entry and compared price</figcaption>}
    </figure>
  )
}
