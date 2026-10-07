import { DirectionButtons } from './DirectionButtons'

interface Props {
  price: string | null
  onPredict?: (direction: 'UP' | 'DOWN') => void
  isSubmitting: boolean
}

/**
 * Headline copy + direction buttons section inside MarketCard.
 * Disabled when price is unavailable or a submission is in flight.
 */
export function PredictionPanel({ price, onPredict, isSubmitting }: Props) {
  const disabled = price === null || isSubmitting

  return (
    <div>
      <h2 className="play-title">Will BTC be higher or lower?</h2>
      <p className="play-sub">
        Make your call. We&apos;ll check in at least 60 seconds later and score your prediction.
      </p>

      <DirectionButtons
        onPredict={onPredict}
        disabled={disabled}
        isSubmitting={isSubmitting}
      />

      <div className="payout">
        <span><b>+1</b> point for a correct call</span>
        <span><b>−1</b> point for a wrong call</span>
      </div>
    </div>
  )
}
