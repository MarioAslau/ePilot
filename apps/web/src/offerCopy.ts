import type { OfferMode } from 'contracts'
import { CornerDownRight, Layers, type LucideIcon } from 'lucide-react'
import { REDEMPTION_NAME } from './featureNames'

/**
 * How each optional round is named and drawn. `roundName` labels the round itself ("Bonus round correct").
 * Numbers come from OFFER_RULES, never from here.
 */
export const MODE_DISPLAY: Record<OfferMode, { name: string; Icon: LucideIcon; roundName: string }> = {
  DOUBLE_DOWN: { name: 'Double Down', Icon: Layers, roundName: 'Bonus' },
  REDEMPTION: { name: REDEMPTION_NAME, Icon: CornerDownRight, roundName: REDEMPTION_NAME },
}
