import { formatTime } from '../format'
import { FrameProvider, useChartFrame } from './frame'
import { EntryLine, HeadDot, PriceLine, RoundMarks } from './layers'
import type { ChartRound } from './model'
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

  return (
    <>
      <div className="spark" ref={ref}>
        <FrameProvider value={frame}>
          <svg
            width={size.width}
            height={size.height}
            viewBox={`0 0 ${size.width} ${size.height}`}
            role="img"
            aria-label="BTC/USD price chart"
          >
            <RoundMarks />
            <EntryLine />
            <PriceLine />
            <HeadDot />
          </svg>
        </FrameProvider>
        {!round && samples.length < 2 && <div className="spark-note">Collecting recent prices</div>}
      </div>
      <div className="spark-axis">
        {round ? (
          <>
            <span><i className="entry-swatch" aria-hidden="true" /> Your entry</span>
            <span>Result window from {formatTime(round.earliestResolveAt)}</span>
          </>
        ) : (
          <>
            <span>Last 2 minutes</span>
            <span>Now</span>
          </>
        )}
      </div>
    </>
  )
}
