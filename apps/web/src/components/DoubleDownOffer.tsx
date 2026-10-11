import type { Offer } from 'contracts'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useRef } from 'react'
import { roundLabel } from '../offer'
import { DoubleDownBadge } from './DoubleDownBadge'

interface Props {
  offer: Offer
  serverNowMs: number
  submitting: boolean
  error: string | null
  busy: boolean
  onAccept: () => void
  onDecline: () => void
  onExtend: () => void
}

export function DoubleDownOffer({
  offer,
  serverNowMs,
  submitting,
  error,
  busy,
  onAccept,
  onDecline,
  onExtend,
}: Props) {
  const total = Math.max(1, new Date(offer.expiresAt).getTime() - new Date(offer.issuedAt).getTime())
  const remaining = Math.max(0, new Date(offer.expiresAt).getTime() - serverNowMs)
  const frozen = useRef(remaining / total)
  if (!submitting) frozen.current = remaining / total
  const fraction = submitting ? frozen.current : remaining / total
  const seconds = Math.max(0, Math.ceil(remaining / 1000))
  const lit = Math.ceil(fraction * 10)
  const word = offer.direction === 'DOWN' ? 'Down' : 'Up'
  const description = `Your plus 1 is kept. Same direction, ${word}. If right, plus 2, pair total plus 3. If wrong, minus 2, pair total minus 1.`

  return (
    <section className="dd" aria-labelledby="dd-title" aria-describedby="dd-desc" aria-busy={submitting}>
      <div className="dd-meter" aria-hidden="true">
        <span style={{ transform: `scaleX(${fraction})` }} />
      </div>
      <div className="dd-pips" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <i key={index} className={index < lit ? 'on' : ''} />
        ))}
      </div>
      <div className="dd-top">
        <DoubleDownBadge />
        <span className="num" aria-hidden="true">{submitting ? 'Timer held' : `${seconds}s left`}</span>
      </div>
      <h2 id="dd-title">Play one bonus round in the same direction?</h2>
      <p className="dd-kept">
        <Check className="ic" size={14} aria-hidden="true" />
        <span><b>+1 kept</b> from round {roundLabel(offer.parentPredictionId)}. Whatever you choose, it stays.</span>
      </p>
      <p>
        Direction is fixed: {offer.direction === 'DOWN'
          ? <ChevronDown className="ic" size={14} aria-hidden="true" />
          : <ChevronUp className="ic" size={14} aria-hidden="true" />}
        <b> {word}</b>. New entry price, at least 60 seconds again.
      </p>
      <div className="dd-tiles" aria-hidden="true">
        <p className="win">If right · <b>+2</b> bonus · Pair total <b>+3</b></p>
        <p className="loss">If wrong · <b>−2</b> bonus · Pair total <b>−1</b></p>
      </div>
      <p id="dd-desc" className="sr-only">{description}</p>
      {error && <p className="dd-error">{error}</p>}
      <div className="dd-actions">
        <button type="button" className="btn dd-action" onClick={onAccept} disabled={busy}>
          {submitting && <span className="spin" aria-hidden="true" />}
          {submitting ? 'Recording…' : 'Double down'}
        </button>
        <button type="button" className="btn dd-action" onClick={onDecline} disabled={busy}>
          No thanks
        </button>
      </div>
      <p className="fine">
        {submitting
          ? 'Locking a fresh entry price. Your +1 is safe either way.'
          : 'Picking Up or Down below also ends this offer.'}
        {!submitting && offer.extensions < 10 && (
          <button type="button" className="dd-link" onClick={onExtend} disabled={busy}>Need more time?</button>
        )}
      </p>
    </section>
  )
}
