import { type PriceSample } from '../market'
import { PriceChart } from './PriceChart'
import { PredictionPanel } from './PredictionPanel'
import { PriceStatus } from './PriceStatus'

type Status = 'loading' | 'live' | 'stale' | 'unavailable'

interface Props {
  price: string | null
  status: Status
  ageSeconds?: number
  samples?: PriceSample[]
  now?: number
  showPrediction?: boolean
  onPredict?: (direction: 'UP' | 'DOWN') => void
  isSubmitting?: boolean
}

/**
 * Left-column card: current BTC/USD price and, in fixtures, the prediction panel.
 */
export function MarketCard({
  price,
  status,
  ageSeconds,
  samples,
  now,
  showPrediction = true,
  onPredict,
  isSubmitting,
}: Props) {
  return (
    <article className="card stage" aria-label="BTC/USD market and prediction">
      <div>
        <PriceStatus price={price} status={status} ageSeconds={ageSeconds} />
        {samples && <PriceChart samples={samples} now={now ?? Date.now()} />}
      </div>

      {showPrediction && (
        <div className="stage-play">
          <PredictionPanel
            price={price}
            onPredict={onPredict}
            isSubmitting={isSubmitting ?? false}
          />
        </div>
      )}
    </article>
  )
}
