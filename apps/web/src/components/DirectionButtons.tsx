import type { Direction } from 'contracts'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { WAIT_SECONDS } from '../timing'

const BUTTONS = [
  { direction: 'UP', Icon: ChevronUp, word: 'Up', hint: 'Higher', className: 'up', act: 'predict-up' },
  { direction: 'DOWN', Icon: ChevronDown, word: 'Down', hint: 'Lower', className: 'down', act: 'predict-down' },
] as const

/** Up and Down calls. Disabled while there is no live price or a submission is in flight. */
export function DirectionButtons({ onPredict, disabled = false }: { onPredict?: (direction: Direction) => void; disabled?: boolean }) {
  return (
    <div className="choices">
      {BUTTONS.map(({ direction, Icon, word, hint, className, act }) => (
        <button
          key={direction}
          type="button"
          className={`choice ${className}`}
          onClick={() => onPredict?.(direction)}
          disabled={disabled}
          data-act={act}
          aria-label={`Predict Bitcoin will go ${word}`}
        >
          <span className="cl">
            <Icon className="ic" aria-hidden="true" />
            {word}
          </span>
          <small>{hint} in {WAIT_SECONDS}+ seconds</small>
        </button>
      ))}
    </div>
  )
}
