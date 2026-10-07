import { TrendingDown, TrendingUp } from 'lucide-react'

type Status = 'loading' | 'live' | 'stale' | 'unavailable'

interface Props {
  price: string | null
  status: Status
  lastUpdated?: Date
}

function PillLabel({ status }: { status: Status }) {
  if (status === 'loading') return <span className="pill neutral"><span className="dot" />Loading…</span>
  if (status === 'live')    return <span className="pill live"><span className="dot" />Live</span>
  if (status === 'stale')   return <span className="pill delayed"><span className="dot" />Delayed</span>
  return <span className="pill unavail"><span className="dot" />Unavailable</span>
}

function formatPrice(raw: string | null): string {
  if (!raw) return '—'
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Displays the live BTC/USD price with freshness status pill.
 * Skeleton shown while loading; stale prices are visually dimmed.
 */
export function PriceStatus({ price, status, lastUpdated }: Props) {
  const formatted = formatPrice(price)

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
        {status === 'live' && (
          <span className="tick-ind up" aria-hidden="true">
            <TrendingUp className="ic" size={14} />
          </span>
        )}
        {status === 'unavailable' && (
          <span className="tick-ind down" aria-hidden="true">
            <TrendingDown className="ic" size={14} />
          </span>
        )}
      </div>

      <div className="mk-meta">
        <span>Coinbase Exchange · BTC-USD</span>
        {lastUpdated && (
          <span className="num">
            Updated {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  )
}
