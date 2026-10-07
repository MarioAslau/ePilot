import { ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  onPredict?: (direction: 'UP' | 'DOWN') => void
  disabled?: boolean
  isSubmitting?: boolean
  /** When the player has an active round, dim the non-chosen button */
  activeDirection?: 'UP' | 'DOWN'
}

/**
 * Up / Down call-to-action buttons.
 * Accessible: both are real <button> elements with aria-labels.
 * Visual states: normal, disabled (no price), submitting (spinner), dimmed (active round).
 */
export function DirectionButtons({ onPredict, disabled, isSubmitting, activeDirection }: Props) {
  function handleClick(direction: 'UP' | 'DOWN') {
    if (!disabled && !isSubmitting && onPredict) {
      onPredict(direction)
    }
  }

  const upDimmed   = activeDirection === 'DOWN'
  const downDimmed = activeDirection === 'UP'

  return (
    <div className="choices">
      <button
        type="button"
        className={`choice up${upDimmed ? ' dim' : ''}${isSubmitting && activeDirection === 'UP' ? ' loading' : ''}`}
        onClick={() => handleClick('UP')}
        disabled={disabled && !activeDirection}
        aria-label="Predict Bitcoin will go Up"
        aria-pressed={activeDirection === 'UP'}
      >
        <span className="cl">
          {isSubmitting && activeDirection === 'UP'
            ? <span className="spin dark" aria-hidden="true" />
            : <ChevronUp className="ic" aria-hidden="true" />
          }
          Up
        </span>
        <small>Higher in 60+ seconds</small>
      </button>

      <button
        type="button"
        className={`choice down${downDimmed ? ' dim' : ''}${isSubmitting && activeDirection === 'DOWN' ? ' loading' : ''}`}
        onClick={() => handleClick('DOWN')}
        disabled={disabled && !activeDirection}
        aria-label="Predict Bitcoin will go Down"
        aria-pressed={activeDirection === 'DOWN'}
      >
        <span className="cl">
          {isSubmitting && activeDirection === 'DOWN'
            ? <span className="spin dark" aria-hidden="true" />
            : <ChevronDown className="ic" aria-hidden="true" />
          }
          Down
        </span>
        <small>Lower in 60+ seconds</small>
      </button>
    </div>
  )
}
