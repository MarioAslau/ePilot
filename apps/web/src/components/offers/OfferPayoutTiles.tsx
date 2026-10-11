import type { OfferPayout } from 'contracts'

function signed(value: number): string {
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`
}

export function OfferPayoutTiles({ payout, bonusWord = false }: { payout: OfferPayout; bonusWord?: boolean }) {
  const bonus = bonusWord ? ' bonus' : ''
  return (
    <div className="dd-tiles" aria-hidden="true">
      <p className="win">
        If right · <b>{signed(payout.win)}</b>{bonus} · Pair total <b>{signed(payout.parentDelta + payout.win)}</b>
      </p>
      <p className="loss">
        If wrong · <b>{signed(payout.loss)}</b>{bonus} · Pair total <b>{signed(payout.parentDelta + payout.loss)}</b>
      </p>
    </div>
  )
}
