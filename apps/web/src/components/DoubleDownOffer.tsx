import type { Offer } from 'contracts'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { roundLabel } from '../offer'
import { DoubleDownBadge } from './DoubleDownBadge'
import { OfferPayoutTiles } from './offers/OfferPayoutTiles'
import { OfferTimer } from './offers/OfferTimer'

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
  const word = offer.direction === 'DOWN' ? 'Down' : 'Up'
  const description = `Your plus 1 is kept. Same direction, ${word}. If right, plus 2, pair total plus 3. If wrong, minus 2, pair total minus 1.`

  return (
    <section className="dd" aria-labelledby="dd-title" aria-describedby="dd-desc" aria-busy={submitting}>
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
              <DoubleDownBadge />
              <span className="num" aria-hidden="true">{clock.submitting ? 'Timer held' : `${clock.seconds}s left`}</span>
            </div>
            <h2 id="dd-title">Play one bonus round in the same direction?</h2>
            <p className="dd-kept">
              <Check className="ic" size={14} aria-hidden="true" />
              <span><b>+1 kept</b> from round {roundLabel(offer.parentPredictionId)}. Whatever you choose, it stays.</span>
            </p>
            <p>
              Direction is fixed: {offer.direction === 'DOWN'
                ? <ChevronDown className="ic" size={14} aria-hidden="true" />
                : <ChevronUp className="ic" size={14} aria-hidden="true" />}
              <b> {word}</b>. New entry price, at least 60 seconds again.
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
