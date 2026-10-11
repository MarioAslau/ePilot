import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react'
import { type ReactNode } from 'react'

type Kind = 'info' | 'warn' | 'error'

interface Props {
  kind: Kind
  message: ReactNode
  detail?: ReactNode
  onDismiss?: () => void
}

const icons: Record<Kind, ReactNode> = {
  info:  <Info  className="ic" size={18} aria-hidden="true" />,
  warn:  <AlertTriangle className="ic" size={18} aria-hidden="true" />,
  error: <AlertCircle  className="ic" size={18} aria-hidden="true" />,
}

const roles: Record<Kind, string> = {
  info:  'status',
  warn:  'alert',
  error: 'alert',
}

/**
 * Inline status notice: loading, stale-data, error, or info states.
 * Uses semantic roles: `status` for info, `alert` for warn/error.
 */
export function StatusNotice({ kind, message, detail, onDismiss }: Props) {
  return (
    <div className={`notice ${kind}`} role={roles[kind]}>
      {icons[kind]}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p>{message}</p>
        {detail && <p style={{ marginTop: 4 }}>{detail}</p>}
      </div>
      {onDismiss && (
        <button
          type="button"
          className="iconbtn x"
          onClick={onDismiss}
          aria-label="Dismiss notice"
        >
          <X className="ic" size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
