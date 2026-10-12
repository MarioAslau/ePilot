import type { OfferMode } from 'contracts'
import { REDEMPTION_NAME } from '../featureNames'
import { roundLabel } from '../format'
import { Ban, Check, Clock, Copy } from 'lucide-react'
import { StatusNotice } from './StatusNotice'

export type OfferEndPhase = 'expired' | 'declined' | 'used' | 'replaced'

const PHASE_STYLE = {
  expired: { kind: 'neutral', icon: Clock },
  declined: { kind: 'neutral', icon: Check },
  used: { kind: 'info', icon: Ban },
  replaced: { kind: 'info', icon: Copy },
} as const

/** Bold lead and the sentence after it, for each mode and way the offer ended. */
const COPY: Record<OfferMode, Record<OfferEndPhase, (round: string) => [lead: string, rest: string]>> = {
  DOUBLE_DOWN: {
    expired: () => ['Offer ended. Your +1 is kept.', "Pick Up or Down whenever you're ready for a normal round."],
    declined: () => ['No bonus round. Your +1 is kept.', "Pick Up or Down whenever you're ready."],
    used: (round) => [
      'Offer no longer available.',
      `You already doubled down on round ${round} in another tab. Your +1 is kept, and that bonus round is the one you see here.`,
    ],
    replaced: (round) => [
      'Offer no longer available.',
      `A new round was started in another tab, which ended the Double Down offer for round ${round}. Your +1 is kept.`,
    ],
  },
  REDEMPTION: {
    expired: () => ['Offer ended. Your −1 stands.', "Pick Up or Down whenever you're ready for a normal round."],
    declined: () => [`No ${REDEMPTION_NAME} round. Your −1 stands.`, "Pick Up or Down whenever you're ready."],
    used: (round) => [
      'Offer no longer available.',
      `A ${REDEMPTION_NAME} round for round ${round} was already started in another tab. Your −1 is kept, and that round is the one shown here.`,
    ],
    replaced: (round) => [
      'Offer no longer available.',
      `A normal round was started in another tab, which ended the ${REDEMPTION_NAME} offer for round ${round}. Your −1 is kept.`,
    ],
  },
}

export function OfferEndNotice({
  mode,
  phase,
  parentPredictionId,
  onDismiss,
}: {
  mode: OfferMode
  phase: OfferEndPhase
  parentPredictionId: string
  onDismiss?: () => void
}) {
  const [lead, rest] = COPY[mode][phase](roundLabel(parentPredictionId))
  return <StatusNotice {...PHASE_STYLE[phase]} onDismiss={onDismiss} message={<><b>{lead}</b> {rest}</>} />
}
