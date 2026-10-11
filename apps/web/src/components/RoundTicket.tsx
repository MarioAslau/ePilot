import type { Direction, WaitReason } from 'contracts'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface Props {
  direction: Direction
  entryPrice: string
  entryTime: Date
  deadline: Date
  predictionId: string
  state?: WaitReason
  /** Seconds remaining until deadline (computed by parent) */
  secondsRemaining?: number
  note?: string
  latestPrice?: string
  autoFocus?: boolean
}

function formatPrice(raw: string): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDelta(entry: string, latest: string): string {
  const delta = Number(latest) - Number(entry)
  if (!Number.isFinite(delta)) return ''
  const body = Math.abs(delta).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (delta > 0) return `+${body}`
  if (delta < 0) return `−${body}`
  return body
}

function stateLabel(state: WaitReason): string {
  if (state === 'WAITING_FOR_DEADLINE') return 'Minimum wait'
  if (state === 'EQUAL_PRICE') return 'Still waiting'
  if (state === 'PROVIDER_HOLD') return 'On hold'
  return 'Comparing prices'
}

function stateDetail(state: WaitReason): string {
  if (state === 'WAITING_FOR_DEADLINE') return "Minimum wait — Not final. Moves during this minute don't count."
  if (state === 'CHECKING_PRICE') return "Minimum wait complete. We're checking the latest price."
  if (state === 'EQUAL_PRICE') return 'The latest price equals your entry price. Still waiting.'
  if (state === 'PROVIDER_HOLD') return 'Our price source is temporarily unavailable. Your round is on hold, and an outage never counts as a loss.'
  return ''
}

/**
 * Active-round tracking card shown after a prediction is submitted.
 * The latest price is the display quote. It does not settle the round.
 */
export function RoundTicket({
  direction,
  entryPrice,
  entryTime,
  deadline,
  predictionId,
  state = 'WAITING_FOR_DEADLINE',
  secondsRemaining,
  note,
  latestPrice,
  autoFocus = false,
}: Props) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (autoFocus) heading.current?.focus()
  }, [autoFocus])
  const isUp = direction === 'UP'
  const onHold = state === 'EQUAL_PRICE' || state === 'PROVIDER_HOLD'
  const counting = secondsRemaining != null && secondsRemaining > 0 && state === 'WAITING_FOR_DEADLINE'
  const comparing = state !== 'WAITING_FOR_DEADLINE'

  const progress = secondsRemaining != null
    ? Math.max(0, Math.min(1, 1 - secondsRemaining / 60))
    : 0
  const circumference = 2 * Math.PI * 34
  const offset = circumference * (1 - progress)

  return (
    <div className={`ticket ${onHold ? 'hold' : isUp ? 'up' : 'down'}`}>
      <h2 id="round-heading" className="play-title" tabIndex={-1} ref={heading}>
        Your prediction
      </h2>
      <div className="tk-head">
        <span className={`dirtag ${isUp ? 'up' : 'down'}`} aria-label={`Prediction: ${direction}`}>
          {isUp
            ? <ChevronUp className="ic" aria-hidden="true" />
            : <ChevronDown className="ic" aria-hidden="true" />}
          {isUp ? 'Going Up' : 'Going Down'}
        </span>
        <span className="tk-id fine">#{predictionId.slice(-6).toUpperCase()}</span>
      </div>

      <ol className="steps" aria-label="Round progress">
        <li className="done">Placed</li>
        <li className={state === 'WAITING_FOR_DEADLINE' ? 'cur' : 'done'}>Waiting</li>
        <li className={comparing ? 'cur' : ''}>Comparing</li>
        <li>Result</li>
      </ol>

      <dl className="tk-prices">
        <div>
          <dt className="k">Entry price</dt>
          <dd className="v num">{formatPrice(entryPrice)}</dd>
          <dd className="d fine">Trade {formatTime(entryTime)}</dd>
        </div>
        {latestPrice && (
          <div>
            <dt className="k">Latest price</dt>
            <dd className="v num">{formatPrice(latestPrice)}</dd>
            <dd className="d fine">not final {formatDelta(entryPrice, latestPrice)}</dd>
          </div>
        )}
        <div>
          <dt className="k">Resolution after</dt>
          <dd className="v num">{formatTime(deadline)}</dd>
          <dd className="d fine">≥ 60 seconds</dd>
        </div>
      </dl>

      <div className="tk-body">
        <div className="tk-wait">
          {counting ? (
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
              <span className="spin" aria-hidden="true" />
            </div>
          )}

          <div>
            <strong>{stateLabel(state)}</strong>
            <p>{stateDetail(state)}</p>
            {note && <p>{note}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
