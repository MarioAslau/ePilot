import { pairTotals, type OfferPayout } from 'contracts'
import { signedPoints } from '../../format'

export function OfferPayoutTiles({ payout, bonusWord = false }: { payout: OfferPayout; bonusWord?: boolean }) {
  const bonus = bonusWord ? ' bonus' : ''
  const pair = pairTotals(payout)
  return (
    <div className="dd-tiles" aria-hidden="true">
      <p className="win">
        If right · <b>{signedPoints(payout.win)}</b>{bonus} · Pair total <b>{signedPoints(pair.win)}</b>
      </p>
      <p className="loss">
        If wrong · <b>{signedPoints(payout.loss)}</b>{bonus} · Pair total <b>{signedPoints(pair.loss)}</b>
      </p>
    </div>
  )
}
