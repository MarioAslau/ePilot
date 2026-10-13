import type { ReactNode } from 'react'
import { layoutSlot } from '../layout'
import type { PriceSample } from '../chart/samples'
import type { FeedStatus } from '../market'
import type { ChartRound } from '../chart/model'
import { PriceChart } from '../chart/PriceChart'
import { PriceStatus } from './PriceStatus'

interface Props {
  price: string | null
  status: FeedStatus
  ageSeconds?: number
  samples?: PriceSample[]
  now?: number
  round?: ChartRound
  children?: ReactNode
}

/**
 * The stage: market on top, play underneath. One card, one place.
 */
export function MarketCard({
  price,
  status,
  ageSeconds,
  samples,
  now,
  round,
  children,
}: Props) {
  return (
    <article className="card stage" aria-label="BTC/USD market and prediction" {...layoutSlot('stage')}>
      <div className="stage-market" {...layoutSlot('stage-market')}>
        <PriceStatus price={price} status={status} ageSeconds={ageSeconds} />
        <PriceChart samples={samples ?? []} now={now ?? Date.now()} round={round} feed={status} />
      </div>
      {children ? <div className="stage-play" {...layoutSlot('stage-play')}>{children}</div> : null}
    </article>
  )
}
