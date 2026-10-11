import { useRef, type ReactNode } from 'react'

export interface OfferClock {
  seconds: number
  submitting: boolean
  extend: ReactNode
}

interface Props {
  issuedAt: string
  expiresAt: string
  serverNowMs: number
  submitting: boolean
  extensions: number
  busy: boolean
  onExtend: () => void
  children: (clock: OfferClock) => ReactNode
}

export function OfferTimer({
  issuedAt,
  expiresAt,
  serverNowMs,
  submitting,
  extensions,
  busy,
  onExtend,
  children,
}: Props) {
  const total = Math.max(1, new Date(expiresAt).getTime() - new Date(issuedAt).getTime())
  const remaining = Math.max(0, new Date(expiresAt).getTime() - serverNowMs)
  const frozen = useRef(remaining / total)
  if (!submitting) frozen.current = remaining / total
  const fraction = submitting ? frozen.current : remaining / total
  const seconds = Math.max(0, Math.ceil(remaining / 1000))
  const lit = Math.ceil(fraction * 10)
  const extend = !submitting && extensions < 10
    ? (
      <button type="button" className="dd-link" data-act="more-time" onClick={onExtend} disabled={busy}>
        Need more time?
      </button>
    )
    : null

  return (
    <>
      <div className="dd-meter" aria-hidden="true">
        <span style={{ transform: `scaleX(${fraction})` }} />
      </div>
      <div className="dd-pips" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <i key={index} className={index < lit ? 'on' : ''} />
        ))}
      </div>
      {children({ seconds, submitting, extend })}
    </>
  )
}
