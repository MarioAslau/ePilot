import { ModeBadge } from './ModeBadge'

export function DoubleDownBadge({ label = 'Double Down' }: { label?: string }) {
  return <ModeBadge mode="DOUBLE_DOWN" label={label} />
}
