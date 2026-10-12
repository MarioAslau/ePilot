import type { OfferMode } from 'contracts'
import { CornerDownRight, Layers, type LucideIcon } from 'lucide-react'
import { REDEMPTION_NAME } from './featureNames'

/**
 * How each optional round is named and drawn. `roundName` labels the round itself ("Bonus round correct").
 * Numbers come from OFFER_RULES, never from here.
 */
/** Shown when an accept fails for a reason the player can retry while the offer lasts. */
export const ACCEPT_FAILED: Record<OfferMode, string> = {
  DOUBLE_DOWN: 'Bonus round not started. Your +1 is kept. You can try again while the offer lasts.',
  REDEMPTION: "We couldn't get a fresh price for the entry. Your −1 is kept. You can try again while the offer lasts.",
}

export const MODE_DISPLAY: Record<OfferMode, { name: string; Icon: LucideIcon; roundName: string }> = {
  DOUBLE_DOWN: { name: 'Double Down', Icon: Layers, roundName: 'Bonus' },
  REDEMPTION: { name: REDEMPTION_NAME, Icon: CornerDownRight, roundName: REDEMPTION_NAME },
}
