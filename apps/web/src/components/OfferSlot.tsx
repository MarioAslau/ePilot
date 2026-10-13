import type { Offer } from 'contracts'
import type { OfferPhase } from '../offer'
import type { useOffer } from '../useOffer'
import { DoubleDownOffer } from './DoubleDownOffer'
import { OfferEndNotice } from './OfferEndNotice'
import { RedemptionOffer } from './RedemptionOffer'

/** The offer card while it is open, or the notice that says how it ended. */
export function OfferSlot({
  offer,
  phase,
  controls,
  serverNowMs,
  busy,
  onDecline,
}: {
  offer: Offer
  phase: OfferPhase
  controls: ReturnType<typeof useOffer>
  serverNowMs: number
  busy: boolean
  onDecline: () => void
}) {
  if (phase === 'open' || phase === 'submitting') {
    const shared = {
      offer,
      serverNowMs,
      submitting: phase === 'submitting',
      error: controls.error,
      busy,
      onDecline,
      onExtend: () => void controls.extend(),
    }
    return offer.mode === 'REDEMPTION' ? (
      <RedemptionOffer
        {...shared}
        pendingDirection={controls.acceptDirection}
        restored={controls.restoredOfferId === offer.offerId}
        onAccept={(direction) => void controls.accept(direction)}
      />
    ) : (
      <DoubleDownOffer {...shared} onAccept={() => void controls.accept()} />
    )
  }
  return (
    <OfferEndNotice
      mode={offer.mode}
      phase={phase}
      onDismiss={() => controls.dismiss(offer.offerId)}
    />
  )
}
