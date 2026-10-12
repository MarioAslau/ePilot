import { formatUsd } from '../format'
import type { FeedStatus as Status } from '../market'

interface Props {
  price: string | null
  status: Status
  ageSeconds?: number
}

function PillLabel({ status }: { status: Status }) {
  if (status === 'loading') return <span className="pill neutral"><span className="dot" />Loading…</span>
  if (status === 'live') return <span className="pill live"><span className="dot" />Live</span>
  if (status === 'stale') return <span className="pill delayed"><span className="dot" />Delayed</span>
  return <span className="pill unavail"><span className="dot" />Unavailable</span>
}

function ageLabel(status: Status, ageSeconds: number | undefined): string | null {
  if (ageSeconds === undefined || status === 'loading' || status === 'unavailable') return null
  if (status === 'stale') return `Last known price, updated ${ageSeconds}s ago`
  return `Updated ${ageSeconds}s ago`
}

/**
 * Displays the BTC/USD price with a freshness pill.
 * A stale price is dimmed. Age uses the browser receive time.
 */
export function PriceStatus({ price, status, ageSeconds }: Props) {
  const formatted = formatUsd(price)
  const age = ageLabel(status, ageSeconds)

  return (
    <div>
      <div className="mk-head">
        <p className="pair">BTC <span>/ USD</span></p>
        <PillLabel status={status} />
      </div>

      <div className="mk-row">
        {status === 'loading' ? (
          <span className="sk" style={{ width: 220, height: 40, display: 'block' }} aria-hidden="true" />
        ) : (
          <p
            className={`mk-price num${status === 'stale' ? ' stale' : ''}`}
            aria-label={`Bitcoin price: ${formatted} US dollars`}
          >
            {formatted}
          </p>
        )}
      </div>

      {age && (
        <div className="mk-meta">
          <span className="num">{age}</span>
        </div>
      )}
    </div>
  )
}
