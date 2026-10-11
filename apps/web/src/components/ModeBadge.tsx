import { CornerDownRight, Layers } from 'lucide-react'
import type { OfferMode } from 'contracts'
import { REDEMPTION_NAME } from '../featureNames'

export function ModeBadge({ mode, label }: { mode: OfferMode; label?: string }) {
  const redemption = mode === 'REDEMPTION'
  const Icon = redemption ? CornerDownRight : Layers
  return (
    <span className="dd-badge">
      <Icon className="ic" size={14} aria-hidden="true" />
      {label ?? (redemption ? REDEMPTION_NAME : 'Double Down')}
    </span>
  )
}
