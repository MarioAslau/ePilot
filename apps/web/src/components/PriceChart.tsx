import type { PriceSample } from '../market'

export interface ChartRound {
  acceptedAt: number
  earliestResolveAt: number
  entryPrice: string
}

const IDLE_MS = 120_000

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function PriceChart({
  samples,
  now,
  round,
}: {
  samples: PriceSample[]
  now: number
  round?: ChartRound
}) {
  const start = round ? round.acceptedAt - 60_000 : now - IDLE_MS
  const end = round ? Math.max(round.earliestResolveAt + 8_000, now + 3_000) : now
  const visible = samples.filter((sample) => sample.receivedAt >= start && sample.receivedAt <= end)
  const caption = round
    ? `Your entry. Result window from ${formatClock(round.earliestResolveAt)}`
    : 'Last 2 minutes. Now'

  const width = 100
  const height = 40
  const padX = 2
  const padY = 4
  const spanT = end - start || 1
  const xOf = (t: number) => padX + ((t - start) / spanT) * (width - padX * 2)
  const prices = visible.map((sample) => Number(sample.price))
  if (round) prices.push(Number(round.entryPrice))
  const finite = prices.filter((price) => Number.isFinite(price))
  const low = finite.length ? Math.min(...finite) : 0
  const high = finite.length ? Math.max(...finite) : 1
  const spanP = high - low || 1
  const yOf = (price: number) => padY + (1 - (price - low) / spanP) * (height - padY * 2)
  const points = visible
    .map((sample) => `${xOf(sample.receivedAt)},${yOf(Number(sample.price))}`)
    .join(' ')
  const latest = visible.reduce<typeof visible[number] | null>(
    (best, sample) => (!best || sample.receivedAt > best.receivedAt ? sample : best),
    null,
  )
  const latestX = latest ? xOf(latest.receivedAt) : null
  const entryX = round ? xOf(round.acceptedAt) : null
  const windowX = round ? xOf(round.earliestResolveAt) : null
  const entryY = round && Number.isFinite(Number(round.entryPrice)) ? yOf(Number(round.entryPrice)) : null

  return (
    <>
      <div className="spark">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={caption}>
          {windowX != null && (
            <rect className="window-tint" x={windowX} y="0" width={Math.max(0, width - windowX)} height={height} />
          )}
          {points && (
            <polyline
              points={points}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {entryX != null && entryY != null && (
            <line className="entry-line" x1={entryX} y1={entryY} x2={latestX ?? entryX} y2={entryY} vectorEffect="non-scaling-stroke" />
          )}
          {entryX != null && (
            <line className="entry-mark" x1={entryX} y1="0" x2={entryX} y2={height} vectorEffect="non-scaling-stroke" />
          )}
          {windowX != null && (
            <line className="window-mark" x1={windowX} y1="0" x2={windowX} y2={height} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {!round && visible.length < 2 && <div className="spark-note">Collecting recent prices</div>}
      </div>
      <div className="spark-axis">
        {round ? (
          <>
            <span><i className="entry-swatch" aria-hidden="true" /> Your entry</span>
            <span>Result window from {formatClock(round.earliestResolveAt)}</span>
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
