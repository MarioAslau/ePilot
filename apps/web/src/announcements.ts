import { OFFER_RULES, pairTotals, type Direction, type OfferMode, type OfferPayout, type Outcome } from 'contracts'
import { REDEMPTION_NAME } from './featureNames'
import { spokenPoints } from './format'
import { MODE_DISPLAY } from './offerCopy'

/** Screen-reader text for the live region. Visible copy lives with its component. */

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function payoutSentence(payout: OfferPayout): string {
  const pair = pairTotals(payout)
  return `If right, ${spokenPoints(payout.win)}, pair total ${spokenPoints(pair.win)}. If wrong, ${spokenPoints(payout.loss)}, pair total ${spokenPoints(pair.loss)}.`
}

const OFFER_ENDS = 'The offer ends in 10 seconds; use Need more time to extend it.'

export function winOfferAnnouncement(score: number, direction: Direction): string {
  const word = direction === 'DOWN' ? 'down' : 'up'
  return `Result: correct, plus 1 point. Your score is now ${score}. Double down offer: your plus 1 is kept. You can play one bonus round, same direction, ${word}. ${payoutSentence(OFFER_RULES.DOUBLE_DOWN.payout)} ${OFFER_ENDS}`
}

export function lossOfferAnnouncement(score: number, payout: OfferPayout): string {
  return `Result: incorrect, minus 1 point. Your score is now ${score}. Optional ${REDEMPTION_NAME} round: your minus 1 is kept. You can choose up or down for one fresh round. ${payoutSentence(payout)} ${OFFER_ENDS}`
}

export function followOnStartedAnnouncement(mode: OfferMode, direction: Direction, entryPrice: string): string {
  const { payout } = OFFER_RULES[mode]
  const word = direction === 'DOWN' ? 'down' : 'up'
  return `${MODE_DISPLAY[mode].roundName} round started: ${word}, entry price ${entryPrice}. ${capitalized(spokenPoints(payout.win))} if right, ${spokenPoints(payout.loss)} if wrong. The earliest result is in 60 seconds.`
}

export function followOnResultAnnouncement(
  mode: OfferMode,
  outcome: Outcome,
  score: number,
  parentDelta: number,
  delta: number,
): string {
  const verdict = outcome === 'WIN' ? 'correct' : 'missed'
  return `${MODE_DISPLAY[mode].roundName} round ${verdict}, ${spokenPoints(delta)} points. Pair total ${spokenPoints(parentDelta + delta)}. Your score is now ${score}.`
}

/** What to say when an offer ends in this tab. Null says nothing. */
export const OFFER_END_ANNOUNCEMENT: Record<OfferMode, { expired: string; declined: string | null; lost: string | null }> = {
  DOUBLE_DOWN: { expired: 'Double down offer ended. Your +1 is kept.', declined: null, lost: null },
  REDEMPTION: {
    expired: 'Offer ended. Your minus 1 stands.',
    declined: `No ${REDEMPTION_NAME} round. Your minus 1 stands.`,
    lost: 'This offer is no longer available. Your minus 1 is kept.',
  },
}

export const WELCOME_BACK = `Welcome back. Your ${REDEMPTION_NAME} round settled while this page was closed.`
