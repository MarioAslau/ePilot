import { ChevronDown, ChevronUp, Clock } from 'lucide-react'

type TicketState = 'waiting' | 'checking' | 'equal-price' | 'provider-hold'

interface Props {
  direction: 'UP' | 'DOWN'
  entryPrice: string
  entryTime: Date
  deadline: Date
  predictionId: string
  state?: TicketState
  /** Seconds remaining until deadline (computed by parent) */
  secondsRemaining?: number
}

function formatPrice(raw: string): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function stateLabel(state: TicketState): string {
  if (state === 'waiting')       return 'Waiting for deadline'
  if (state === 'checking')      return 'Checking price…'
  if (state === 'equal-price')   return 'Price unchanged — retrying'
  if (state === 'provider-hold') return 'Provider hold — retrying'
  return ''
}

function stateDetail(state: TicketState): string {
  if (state === 'waiting')       return 'Your prediction locks in at the entry price. Resolution checks begin after the deadline.'
  if (state === 'checking')      return 'Fetching the resolution price from Coinbase. This happens automatically in the background.'
  if (state === 'equal-price')   return 'The current price equals your entry price. Waiting for the market to move before settling.'
  if (state === 'provider-hold') return "The price provider is temporarily unavailable. We'll retry automatically."
  return ''
}

/**
 * Active-round tracking card shown after a prediction is submitted.
 * Displays direction, entry price, deadline and live state copy.
 */
export function RoundTicket({ direction, entryPrice, entryTime, deadline, predictionId, state = 'waiting', secondsRemaining }: Props) {
  const isUp = direction === 'UP'

  const progress = secondsRemaining != null
    ? Math.max(0, Math.min(1, 1 - secondsRemaining / 60))
    : 0
  const circumference = 2 * Math.PI * 34
  const offset = circumference * (1 - progress)

  return (
    <div className={`ticket ${isUp ? 'up' : 'down'}`} aria-live="polite">
      <div className="tk-head">
        <span className={`dirtag ${isUp ? 'up' : 'down'}`} aria-label={`Prediction: ${direction}`}>
          {isUp
            ? <ChevronUp className="ic" aria-hidden="true" />
            : <ChevronDown className="ic" aria-hidden="true" />}
          {isUp ? 'Going Up' : 'Going Down'}
        </span>
        <span className="tk-id fine">#{predictionId.slice(-6).toUpperCase()}</span>
      </div>

      {/* Progress steps */}
      <ol className="steps" aria-label="Round progress">
        <li className="done">Predicted</li>
        <li className={state === 'waiting' ? 'cur' : 'done'}>Waiting</li>
        <li className={state === 'checking' || state === 'equal-price' || state === 'provider-hold' ? 'cur' : ''}>Resolving</li>
        <li>Settled</li>
      </ol>

      {/* Prices */}
      <dl className="tk-prices">
        <div>
          <dt className="k">Entry price</dt>
          <dd className="v num">{formatPrice(entryPrice)}</dd>
          <dd className="d fine">{formatTime(entryTime)}</dd>
        </div>
        <div>
          <dt className="k">Resolution after</dt>
          <dd className="v num">{formatTime(deadline)}</dd>
          <dd className="d fine">≥ 60 seconds</dd>
        </div>
      </dl>

      {/* Wait / state section */}
      <div className="tk-body">
        <div className="tk-wait">
          {secondsRemaining != null && secondsRemaining > 0 ? (
            /* Countdown ring */
            <div className="ring" aria-hidden="true">
              <svg width="76" height="76">
                <circle className="ring-bg" cx="38" cy="38" r="34" />
                <circle
                  className="ring-fg"
                  cx="38" cy="38" r="34"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                />
              </svg>
              <span className="ring timer num">{secondsRemaining}s</span>
            </div>
          ) : (
            <div className="state-ic">
              <Clock aria-hidden="true" size={16} />
            </div>
          )}

          <div>
            <strong>{stateLabel(state)}</strong>
            <p>{stateDetail(state)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
