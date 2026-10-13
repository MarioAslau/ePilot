import { useId } from 'react'
import type { FeedStatus } from '../market'
import { stance } from '../round'
import { FrameProvider, useChartFrame, useLastFrame } from './frame'
import { ComparedMarker, Crosshair, EntryLine, GapHatch, GridLines, HeadDot, PriceLine, RoundMarks, Zones } from './layers'
import { holdLabel, isSettled, readout, readoutText, samplesInView, summary, winningSide, type ChartRound } from './model'
import { SampleTable } from './SampleTable'
import { useScrub } from './useScrub'
import { ComparedTag, EntryTag, GapLabels, GridLabels, HoldTag, PriceTag, ResultLabel, ScrubTooltip, Ticks, ZoneLabel } from './Tags'
import type { PriceSample } from './samples'
import { useChartSize } from './useChartSize'
import { useReducedMotion } from './useReducedMotion'


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
  const hintId = useId()
  const reduced = useReducedMotion()
  const frame = useChartFrame({ samples, now, round, feed, size }, reduced)

  const latest = samples[samples.length - 1]
  const tone = round && latest ? stance(round.direction, round.entryPrice, latest.price).tone : 'idle'
  const hold = holdLabel(round)
  const lastFrame = useLastFrame(frame)
  const inView = samplesInView(samples, now, round)
  const scrub = useScrub(lastFrame, inView, (sample) => readoutText(readout(sample, round)))
  const hover = scrub.hover

  return (
    <>
      <div
        className="spark ch-frame"
        ref={ref}
        tabIndex={0}
        role="img"
        aria-label={summary(latest, round)}
        aria-describedby={hintId}
        {...scrub.handlers}
      >
        <FrameProvider value={frame}>
          <svg width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
            <GridLines />
            <GapHatch />
            {round && <Zones win={winningSide(round.direction)} />}
            <RoundMarks />
            <EntryLine />
            <PriceLine />
            <HeadDot />
            {isSettled(round) && <ComparedMarker outcome={round.result.outcome} />}
            <Crosshair sample={hover} />
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
            <ScrubTooltip sample={hover} readout={hover ? readout(hover, round) : null} />
          </div>
        </FrameProvider>
        {!round && samples.length < 2 && <div className="spark-note">Collecting recent prices</div>}
      </div>
      <p id={hintId} className="sr-only">Use the left and right arrow keys to read prices, Home and End to jump.</p>
      <p className="sr-only" aria-live="polite">{scrub.announcement}</p>
      <SampleTable samples={inView} round={round} />
    </>
  )
}
