import { useEffect, useRef, type ReactNode } from 'react'
import { PLAY_TITLE_ID } from '../focusTargets'
import { DirectionButtons } from './DirectionButtons'

interface Props {
  price: string | null
  onPredict?: (direction: 'UP' | 'DOWN') => void
  isSubmitting: boolean
  disabled?: boolean
  reason?: string | null
  title?: string
  /** Null hides the line. Omitted uses the idle subtitle. */
  subtitle?: string | null
  autoFocus?: boolean
  children?: ReactNode
}

const IDLE_TITLE = 'Higher or lower in a minute?'
const IDLE_SUB = 'Make your call. We\'ll check in at least 60 seconds later and score your prediction.'

export function PlayTitle({
  title,
  subtitle,
  autoFocus = false,
}: {
  title: string
  subtitle?: string | null
  autoFocus?: boolean
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (autoFocus) heading.current?.focus()
  }, [autoFocus])
  return (
    <>
      <h1 id={PLAY_TITLE_ID} className="play-title" tabIndex={-1} ref={heading} data-act="play-title">{title}</h1>
      {subtitle ? <p className="play-sub">{subtitle}</p> : null}
    </>
  )
}

/**
 * Headline copy + direction buttons inside the stage card.
 * Disabled when price is unavailable or a submission is in flight.
 */
export function PredictionPanel({
  price,
  onPredict,
  isSubmitting,
  disabled,
  reason,
  title = IDLE_TITLE,
  subtitle = IDLE_SUB,
  autoFocus = false,
  children,
}: Props) {
  const locked = disabled ?? (price === null || isSubmitting)

  return (
    <div>
      <PlayTitle title={title} subtitle={subtitle} autoFocus={autoFocus} />
      {children}

      <DirectionButtons
        onPredict={onPredict}
        disabled={locked}
        isSubmitting={isSubmitting}
      />
      {isSubmitting && <p className="play-sub">Recording entry</p>}
      {!isSubmitting && reason && <p className="play-sub">{reason}</p>}

      <div className="payout">
        <span><b>+1</b> point for a correct call</span>
        <span><b>−1</b> point for a wrong call</span>
      </div>
    </div>
  )
}
