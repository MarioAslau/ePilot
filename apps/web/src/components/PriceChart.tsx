import { chartSummary, type PriceSample } from '../market'

export function PriceChart({ samples, now }: { samples: PriceSample[]; now: number }) {
  const summary = chartSummary(samples, now)
  if (samples.length < 2) {
    return <div className="spark-empty">Collecting recent prices</div>
  }

  const prices = samples.map((sample) => Number(sample.price))
  const low = Math.min(...prices)
  const high = Math.max(...prices)
  const span = high - low || 1
  const first = samples[0]?.receivedAt ?? now
  const last = samples[samples.length - 1]?.receivedAt ?? first
  const width = 100
  const height = 40
  const padX = 2
  const padY = 4
  const points = samples
    .map((sample) => {
      const x = last === first
        ? width / 2
        : padX + ((sample.receivedAt - first) / (last - first)) * (width - padX * 2)
      const y = padY + (1 - (Number(sample.price) - low) / span) * (height - padY * 2)
      return `${x},${y}`
    })
    .join(' ')
  const change = summary.change1m
  const label = `BTC price over the last ${summary.coverageSeconds} seconds on this page`

  return (
    <>
      <div className="spark">
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={label}>
          <polyline
            points={points}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div className="spark-axis">
        <span>Last {summary.coverageSeconds} s · this page only</span>
        {change !== null && (
          <span className="num">
            {change > 0 ? '+' : ''}
            {change.toFixed(2)} · 1m
          </span>
        )}
      </div>
    </>
  )
}
