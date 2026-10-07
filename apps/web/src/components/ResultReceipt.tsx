import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react'

interface Props {
  outcome: 'WIN' | 'LOSS'
  direction: 'UP' | 'DOWN'
  entryPrice: string
  resolutionPrice: string
  entryTime: Date
  resolutionTime: Date
  predictionId: string
}

function formatPrice(raw: string): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * Settlement result card.
 * Shows outcome (WIN/LOSS), point delta, and the two prices used in the comparison.
 * The resolutionTime comes from the Coinbase ticker `time` field (D1).
 */
export function ResultReceipt({
  outcome,
  direction,
  entryPrice,
  resolutionPrice,
  entryTime,
  resolutionTime,
  predictionId,
}: Props) {
  const isWin  = outcome === 'WIN'
  const isUp   = direction === 'UP'

  return (
    <aside className={`receipt ${isWin ? 'win' : 'loss'}`} aria-label={`Result: ${outcome}`}>
      <div className="rc-top">
        <div className="rc-badge" aria-hidden="true">
          {isWin ? '🎉' : '😬'}
        </div>

        <div>
          <p className="rc-title">{isWin ? 'Correct call!' : 'Wrong call'}</p>
          <p className="rc-sub">
            {isUp
              ? <><ChevronUp className="ic" size={12} aria-hidden="true" /> Predicted Up</>
              : <><ChevronDown className="ic" size={12} aria-hidden="true" /> Predicted Down</>}
          </p>
        </div>

        <div className={`rc-pts num`} aria-label={`${isWin ? 'plus' : 'minus'} 1 point`}>
          {isWin
            ? <><Plus className="ic" size={18} aria-hidden="true" />1</>
            : <><Minus className="ic" size={18} aria-hidden="true" />1</>}
        </div>
      </div>

      <dl className="kv">
        <div>
          <dt>Entry price</dt>
          <dd className="num">{formatPrice(entryPrice)}</dd>
        </div>
        <div>
          <dt>Resolution price</dt>
          <dd className="num">{formatPrice(resolutionPrice)}</dd>
        </div>
        <div>
          <dt>Predicted at</dt>
          <dd>{formatTime(entryTime)}</dd>
        </div>
        <div>
          <dt>Settled at</dt>
          <dd>{formatTime(resolutionTime)}</dd>
        </div>
      </dl>

      <p className="fine">
        Prices from Coinbase Exchange. Resolution price is the first trade at or after the deadline that
        differs from the entry price. Round #{predictionId.slice(-6).toUpperCase()}.
      </p>
    </aside>
  )
}
