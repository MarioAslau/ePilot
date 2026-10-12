import type { OfferMode } from 'contracts'
import { MODE_DISPLAY } from '../offerCopy'

export function ModeBadge({ mode, label }: { mode: OfferMode; label?: string }) {
  const { name, Icon } = MODE_DISPLAY[mode]
  return (
    <span className="dd-badge">
      <Icon className="ic" size={14} aria-hidden="true" />
      {label ?? name}
    </span>
  )
}
