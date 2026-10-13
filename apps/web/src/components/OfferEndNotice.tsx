import { OFFER_RULES, type OfferMode } from 'contracts'
import { REDEMPTION_NAME } from '../featureNames'
import { signedPoints } from '../format'
import { PARENT_ROUND } from '../offerCopy'
import { Ban, Check, Clock, Copy } from 'lucide-react'
import { StatusNotice } from './StatusNotice'

export type OfferEndPhase = 'expired' | 'declined' | 'used' | 'replaced'

const PHASE_STYLE = {
  expired: { kind: 'neutral', icon: Clock },
  declined: { kind: 'neutral', icon: Check },
  used: { kind: 'info', icon: Ban },
  replaced: { kind: 'info', icon: Copy },
} as const

/** Bold lead and the sentence after it, for each mode and way the offer ended. `kept` is the parent's points, e.g. +1. */
const COPY: Record<OfferMode, Record<OfferEndPhase, (kept: string) => [lead: string, rest: string]>> = {
  DOUBLE_DOWN: {
    expired: (kept) => [`Offer ended. Your ${kept} is kept.`, "Pick Up or Down whenever you're ready for a normal round."],
    declined: (kept) => [`No bonus round. Your ${kept} is kept.`, "Pick Up or Down whenever you're ready."],
    used: (kept) => [
      'Offer no longer available.',
      `You already doubled down on your ${PARENT_ROUND} in another tab. Your ${kept} is kept, and that bonus round is the one you see here.`,
    ],
    replaced: (kept) => [
      'Offer no longer available.',
      `A new round was started in another tab, which ended the Double Down offer for your ${PARENT_ROUND}. Your ${kept} is kept.`,
    ],
  },
  REDEMPTION: {
    expired: (kept) => [`Offer ended. Your ${kept} stands.`, "Pick Up or Down whenever you're ready for a normal round."],
    declined: (kept) => [`No ${REDEMPTION_NAME} round. Your ${kept} stands.`, "Pick Up or Down whenever you're ready."],
    used: (kept) => [
      'Offer no longer available.',
      `A ${REDEMPTION_NAME} round for your ${PARENT_ROUND} was already started in another tab. Your ${kept} is kept, and that round is the one shown here.`,
    ],
    replaced: (kept) => [
      'Offer no longer available.',
      `A normal round was started in another tab, which ended the ${REDEMPTION_NAME} offer for your ${PARENT_ROUND}. Your ${kept} is kept.`,
    ],
  },
}

export function OfferEndNotice({
  mode,
  phase,
  onDismiss,
}: {
  mode: OfferMode
  phase: OfferEndPhase
  onDismiss?: () => void
}) {
  const [lead, rest] = COPY[mode][phase](signedPoints(OFFER_RULES[mode].payout.parentDelta))
  return <StatusNotice {...PHASE_STYLE[phase]} onDismiss={onDismiss} message={<><b>{lead}</b> {rest}</>} />
}
