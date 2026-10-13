import { pairTotals, type Offer } from 'contracts'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { directionWord, signedPoints, spokenPoints } from '../format'
import { layoutSlot } from '../layout'
import { PARENT_ROUND } from '../offerCopy'
import { ModeBadge } from './ModeBadge'
import { OfferPayoutTiles } from './offers/OfferPayoutTiles'
import { OfferTimer } from './offers/OfferTimer'
import { WAIT_SECONDS } from '../timing'

interface Props {
  offer: Offer
  serverNowMs: number
  submitting: boolean
  error: string | null
  busy: boolean
  onAccept: () => void
  onDecline: () => void
  onExtend: () => void
}

export function DoubleDownOffer({
  offer,
  serverNowMs,
  submitting,
  error,
  busy,
  onAccept,
  onDecline,
  onExtend,
}: Props) {
  const { payout } = offer
  const pair = pairTotals(payout)
  const word = directionWord(offer.direction ?? 'UP')
  const description = `Your ${spokenPoints(payout.parentDelta)} is kept. Same direction, ${word}. If right, ${spokenPoints(payout.win)}, pair total ${spokenPoints(pair.win)}. If wrong, ${spokenPoints(payout.loss)}, pair total ${spokenPoints(pair.loss)}.`

  return (
    <section className="dd" {...layoutSlot('offer')} aria-labelledby="dd-title" aria-describedby="dd-desc" aria-busy={submitting}>
      <OfferTimer
        issuedAt={offer.issuedAt}
        expiresAt={offer.expiresAt}
        serverNowMs={serverNowMs}
        submitting={submitting}
        extensions={offer.extensions}
        busy={busy}
        onExtend={onExtend}
      >
        {(clock) => (
          <>
            <div className="dd-top">
              <ModeBadge mode="DOUBLE_DOWN" />
              <span className="num" aria-hidden="true">{clock.submitting ? 'Timer held' : `${clock.seconds}s left`}</span>
            </div>
            <h2 id="dd-title">Play one bonus round in the same direction?</h2>
            <p className="dd-kept">
              <Check className="ic" size={14} aria-hidden="true" />
              <span><b>{signedPoints(payout.parentDelta)} kept</b> from your {PARENT_ROUND}. Whatever you choose, it stays.</span>
            </p>
            <p>
              Direction is fixed: {offer.direction === 'DOWN'
                ? <ChevronDown className="ic" size={14} aria-hidden="true" />
                : <ChevronUp className="ic" size={14} aria-hidden="true" />}
              <b> {word}</b>. New entry price, at least {WAIT_SECONDS} seconds again.
            </p>
            <OfferPayoutTiles payout={offer.payout} bonusWord />
            <p id="dd-desc" className="sr-only">{description}</p>
            {error && <p className="dd-error">{error}</p>}
            <div className="dd-actions">
              <button type="button" className="btn dd-action" data-act="double-down" onClick={onAccept} disabled={busy}>
                {submitting && <span className="spin" aria-hidden="true" />}
                {submitting ? 'Recording…' : 'Double down'}
              </button>
              <button type="button" className="btn dd-action" data-act="decline" onClick={onDecline} disabled={busy}>
                No thanks
              </button>
            </div>
            <p className="fine">
              {submitting
                ? 'Locking a fresh entry price. Your +1 is safe either way.'
                : 'Picking Up or Down below also ends this offer.'}
              {clock.extend}
            </p>
          </>
        )}
      </OfferTimer>
    </section>
  )
}
