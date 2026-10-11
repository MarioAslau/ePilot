import { DirectionButtons } from './DirectionButtons'

interface Props {
  price: string | null
  onPredict?: (direction: 'UP' | 'DOWN') => void
  isSubmitting: boolean
  disabled?: boolean
  reason?: string | null
  title?: string
}

/**
 * Headline copy + direction buttons section inside MarketCard.
 * Disabled when price is unavailable or a submission is in flight.
 */
export function PredictionPanel({ price, onPredict, isSubmitting, disabled, reason, title = 'Will BTC be higher or lower?' }: Props) {
  const locked = disabled ?? (price === null || isSubmitting)

  return (
    <div>
      <h2 id="play-title" className="play-title" tabIndex={-1}>{title}</h2>
      <p className="play-sub">
        Make your call. We&apos;ll check in at least 60 seconds later and score your prediction.
      </p>

      <DirectionButtons
        onPredict={onPredict}
        disabled={locked}
        isSubmitting={isSubmitting}
      />
      {isSubmitting && <p className="play-sub">Recording entry</p>}
      {!isSubmitting && reason && <p className="play-sub">{reason}</p>}

      <div className="payout">
        <span><b>+1</b> point for a correct call</span>
        <span><b>−1</b> point for a wrong call</span>
      </div>
    </div>
  )
}
