import { AlertCircle, AlertTriangle, Info, X, type LucideIcon } from 'lucide-react'
import { type ReactNode } from 'react'

type Kind = 'neutral' | 'info' | 'warn' | 'error'

interface Props {
  kind: Kind
  message: ReactNode
  detail?: ReactNode
  /** Overrides the kind's default icon. */
  icon?: LucideIcon
  action?: { label: string; onClick: () => void }
  onDismiss?: () => void
}

const ICONS: Record<Kind, LucideIcon> = {
  neutral: Info,
  info: Info,
  warn: AlertTriangle,
  error: AlertCircle,
}

/**
 * Inline notice for loading, stale data, errors, and how an offer ended.
 * `status` role for neutral and info, `alert` for warn and error.
 */
export function StatusNotice({ kind, message, detail, icon, action, onDismiss }: Props) {
  const Icon = icon ?? ICONS[kind]
  return (
    <div className={`notice ${kind}`} role={kind === 'warn' || kind === 'error' ? 'alert' : 'status'}>
      <Icon className="ic" size={18} aria-hidden="true" />
      <div className="notice-body">
        <p>{message}</p>
        {detail && <p className="notice-detail">{detail}</p>}
        {action && (
          <div className="actions">
            <button type="button" className="btn" onClick={action.onClick}>
              {action.label}
            </button>
          </div>
        )}
      </div>
      {onDismiss && (
        <button type="button" className="iconbtn x" onClick={onDismiss} aria-label="Dismiss notice">
          <X className="ic" size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
