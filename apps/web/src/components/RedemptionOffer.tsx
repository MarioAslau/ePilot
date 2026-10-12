import { pairTotals, type Direction, type Offer } from 'contracts'
import { ArrowDown, ArrowUp, Lock } from 'lucide-react'
import { REDEMPTION_NAME } from '../featureNames'
import { roundLabel, signedPoints, spokenPoints } from '../format'
import { layoutSlot } from '../layout'
import { ModeBadge } from './ModeBadge'
import { OfferPayoutTiles } from './offers/OfferPayoutTiles'
import { OfferTimer } from './offers/OfferTimer'
import { EXTENSION_SECONDS, OFFER_SECONDS, WAIT_SECONDS } from '../timing'

interface Props {
  offer: Offer
  serverNowMs: number
  submitting: boolean
  pendingDirection: Direction | null
  error: string | null
  busy: boolean
  restored?: boolean
  onAccept: (direction: Direction) => void
  onDecline: () => void
  onExtend: () => void
}

export function RedemptionOffer({
  offer,
  serverNowMs,
  submitting,
  pendingDirection,
  error,
  busy,
  restored = false,
  onAccept,
  onDecline,
  onExtend,
}: Props) {
  const { payout } = offer
  const pair = pairTotals(payout)
  const description = `Optional. Choose up or down for one fresh round. If right, ${spokenPoints(payout.win)}, pair total ${spokenPoints(pair.win)}. If wrong, ${spokenPoints(payout.loss)}, pair total ${spokenPoints(pair.loss)}. The offer lasts ${OFFER_SECONDS} seconds; Need more time adds ${EXTENSION_SECONDS} seconds.`

  return (
    <section className="dd rd" {...layoutSlot('offer')} aria-labelledby="rd-title" aria-describedby="rd-desc" aria-busy={submitting}>
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
              <ModeBadge mode="REDEMPTION" />
              <span className="num" aria-hidden="true">{clock.submitting ? 'Timer held' : `${clock.seconds}s left`}</span>
            </div>
            <h2 id="rd-title">Play one {REDEMPTION_NAME} round?</h2>
            <p className="dd-kept">
              <Lock className="ic" size={14} aria-hidden="true" />
              <span><b>{signedPoints(payout.parentDelta)} kept</b> from round {roundLabel(offer.parentPredictionId)}. Whatever you choose, it stays.</span>
            </p>
            <OfferPayoutTiles payout={offer.payout} />
            <p className="fine"><b>Pick a direction to start it</b> · fresh entry price, at least {WAIT_SECONDS} seconds</p>
            <div className="rd-actions" role="group" aria-label={`${REDEMPTION_NAME} round: pick a direction or decline`}>
              {(['UP', 'DOWN'] as const).map((direction) => {
                const chosen = submitting && pendingDirection === direction
                const Icon = direction === 'UP' ? ArrowUp : ArrowDown
                return (
                  <button
                    key={direction}
                    type="button"
                    className={`btn rd-action${chosen ? (direction === 'UP' ? ' busy-up' : ' busy-down') : ''}`}
                    data-act={direction === 'UP' ? 'play-up' : 'play-down'}
                    onClick={() => onAccept(direction)}
                    disabled={busy}
                    aria-busy={chosen || undefined}
                  >
                    {chosen && <span className="spin" aria-hidden="true" />}
                    <Icon className={`ic ${direction === 'UP' ? 'up' : 'down'}`} size={16} aria-hidden="true" />
                    {chosen ? 'Recording…' : direction === 'UP' ? 'Play Up' : 'Play Down'}
                  </button>
                )
              })}
              <button type="button" className="btn rd-action rd-span" data-act="decline" onClick={onDecline} disabled={busy}>
                No thanks
              </button>
            </div>
            <p id="rd-desc" className="sr-only">{description}</p>
            {error && (
              <p className="dd-error">
                <b>{REDEMPTION_NAME} round not started.</b> {error}
              </p>
            )}
            <p className="fine">
              {submitting
                ? 'Locking a fresh entry price. Your −1 stays either way.'
                : 'The Up and Down buttons below start a normal round instead and end this offer.'}
              {clock.extend}
            </p>
            {restored && !submitting && (
              <p className="fine">Restored after refresh. Time left comes from our server.</p>
            )}
          </>
        )}
      </OfferTimer>
    </section>
  )
}
