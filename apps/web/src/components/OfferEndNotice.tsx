import type { OfferMode } from 'contracts'
import { REDEMPTION_NAME } from '../featureNames'
import { roundLabel } from '../offer'
import { OfferNotice } from './OfferNotice'

export function OfferEndNotice({
  mode,
  phase,
  parentPredictionId,
  name = REDEMPTION_NAME,
  onDismiss,
}: {
  mode: OfferMode
  phase: 'expired' | 'declined' | 'used' | 'replaced'
  parentPredictionId: string
  name?: string
  onDismiss?: () => void
}) {
  const label = roundLabel(parentPredictionId)
  if (mode === 'REDEMPTION') {
    if (phase === 'expired') {
      return (
        <OfferNotice
          tone="neutral"
          icon="clock"
          onDismiss={onDismiss}
          message={<><b>Offer ended. Your −1 stands.</b> Pick Up or Down whenever you're ready for a normal round.</>}
        />
      )
    }
    if (phase === 'declined') {
      return (
        <OfferNotice
          tone="neutral"
          icon="check"
          onDismiss={onDismiss}
          message={<><b>No {name} round. Your −1 stands.</b> Pick Up or Down whenever you're ready.</>}
        />
      )
    }
    if (phase === 'used') {
      return (
        <OfferNotice
          tone="info"
          icon="ban"
          onDismiss={onDismiss}
          message={<><b>Offer no longer available.</b> A {name} round for round {label} was already started in another tab. Your −1 is kept, and that round is the one shown here.</>}
        />
      )
    }
    return (
      <OfferNotice
        tone="info"
        icon="copy"
        onDismiss={onDismiss}
        message={<><b>Offer no longer available.</b> A normal round was started in another tab, which ended the {name} offer for round {label}. Your −1 is kept.</>}
      />
    )
  }

  if (phase === 'expired') {
    return (
      <OfferNotice
        tone="neutral"
        icon="clock"
        onDismiss={onDismiss}
        message={<><b>Offer ended. Your +1 is kept.</b> Pick Up or Down whenever you're ready for a normal round.</>}
      />
    )
  }
  if (phase === 'declined') {
    return (
      <OfferNotice
        tone="neutral"
        icon="check"
        onDismiss={onDismiss}
        message={<><b>No bonus round. Your +1 is kept.</b> Pick Up or Down whenever you're ready.</>}
      />
    )
  }
  if (phase === 'used') {
    return (
      <OfferNotice
        tone="info"
        icon="ban"
        onDismiss={onDismiss}
        message={<><b>Offer no longer available.</b> You already doubled down on round {label} in another tab. Your +1 is kept, and that bonus round is the one you see here.</>}
      />
    )
  }
  return (
    <OfferNotice
      tone="info"
      icon="copy"
      onDismiss={onDismiss}
      message={<><b>Offer no longer available.</b> A new round was started in another tab, which ended the Double Down offer for round {label}. Your +1 is kept.</>}
    />
  )
}
