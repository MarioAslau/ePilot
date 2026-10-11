import { Ban, Check, Clock, Copy } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  tone: 'neutral' | 'info'
  icon: 'clock' | 'check' | 'ban' | 'copy'
  message: ReactNode
  onDismiss?: () => void
}

const icons = {
  clock: Clock,
  check: Check,
  ban: Ban,
  copy: Copy,
}

export function OfferNotice({ tone, icon, message, onDismiss }: Props) {
  const Icon = icons[icon]
  return (
    <div className={`notice ${tone === 'info' ? 'info' : ''}`} role="status">
      <Icon className="ic" size={18} aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p>{message}</p>
      </div>
      {onDismiss && (
        <button type="button" className="iconbtn x" onClick={onDismiss} aria-label="Dismiss notice">
          ×
        </button>
      )}
    </div>
  )
}
