import { PriceStatus } from './PriceStatus'
import { PredictionPanel } from './PredictionPanel'

type Status = 'loading' | 'live' | 'stale' | 'unavailable'

interface Props {
  price: string | null
  status: Status
  lastUpdated?: Date
  onPredict?: (direction: 'UP' | 'DOWN') => void
  isSubmitting?: boolean
}

/**
 * Left-column card: current BTC/USD price + prediction interaction.
 * Two sub-sections separated by the .stage-play border:
 *  - Market info (pair, price, status pill)
 *  - Prediction panel (headline, direction buttons)
 */
export function MarketCard({ price, status, lastUpdated, onPredict, isSubmitting }: Props) {
  return (
    <article className="card stage" aria-label="BTC/USD market and prediction">
      {/* Market price section */}
      <div>
        <PriceStatus price={price} status={status} lastUpdated={lastUpdated} />
      </div>

      {/* Prediction interaction section */}
      <div className="stage-play">
        <PredictionPanel
          price={price}
          onPredict={onPredict}
          isSubmitting={isSubmitting ?? false}
        />
      </div>
    </article>
  )
}
