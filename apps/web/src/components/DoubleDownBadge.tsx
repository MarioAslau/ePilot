import { Layers } from 'lucide-react'

export function DoubleDownBadge({ label = 'Double Down' }: { label?: string }) {
  return (
    <span className="dd-badge">
      <Layers className="ic" size={14} aria-hidden="true" />
      {label}
    </span>
  )
}
