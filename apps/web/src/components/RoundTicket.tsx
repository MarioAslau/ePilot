import { OFFER_RULES, pairTotals, type Direction, type Mode, type WaitReason } from 'contracts'
import { ArrowDown, ArrowUp, Equal, Link, Pause } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { directionWord, formatDuration, formatMove, formatTime, formatUsd, roundLabel, signedPoints } from '../format'
import { PLAY_TITLE_ID } from '../focusTargets'
import { MODE_DISPLAY } from '../offerCopy'

interface Props {
  direction: Direction
  entryPrice: string
  entryTime: Date
  deadline: Date
  predictionId: string
  state?: WaitReason
  /** Seconds remaining until deadline (computed by parent) */
  secondsRemaining?: number
  note?: string
  latestPrice?: string
  mode?: Mode
  parentPredictionId?: string
  autoFocus?: boolean
  /** Seconds since the last successful player poll. Shown after the minimum wait. */
  checkedAgoSeconds?: number
}

const DIAL_R = 44
const DIAL_C = 2 * Math.PI * DIAL_R

function phaseWord(state: WaitReason): string {
  if (state === 'WAITING_FOR_DEADLINE') return 'Minimum wait'
  if (state === 'EQUAL_PRICE') return 'Price unchanged'
  if (state === 'PROVIDER_HOLD') return 'On hold'
  return 'Comparing prices'
}

function stateDetail(state: WaitReason, deadline: Date): string {
  if (state === 'WAITING_FOR_DEADLINE') return `Not final. Earliest result ${formatTime(deadline)}.`
  if (state === 'CHECKING_PRICE') return 'We\'re checking the latest price.'
  if (state === 'EQUAL_PRICE') return 'The latest price equals your entry price. Still waiting.'
  if (state === 'PROVIDER_HOLD') return 'Our price source is temporarily unavailable. Your round is on hold, and an outage never counts as a loss.'
  return ''
}

function stance(direction: Direction, entry: string, latest: string): { move: string; word: string; tone: 'ahead' | 'behind' | 'level' } {
  const delta = Number(latest) - Number(entry)
  if (!Number.isFinite(delta) || delta === 0) return { move: formatMove(0), word: 'Level with entry', tone: 'level' }
  const ahead = direction === 'UP' ? delta > 0 : delta < 0
  return {
    move: formatMove(delta),
    word: ahead ? 'Ahead of entry' : 'Behind entry',
    tone: ahead ? 'ahead' : 'behind',
  }
}

function ModeTag({ mode }: { mode: Exclude<Mode, 'STANDARD'> }) {
  const { name, Icon } = MODE_DISPLAY[mode]
  return <span><Icon className="ic" aria-hidden="true" /> {name}</span>
}

/** The kept parent result and what this bonus round can add. */
function FollowOn({ mode, parentPredictionId }: { mode: Exclude<Mode, 'STANDARD'>; parentPredictionId: string }) {
  const { payout } = OFFER_RULES[mode]
  const pair = pairTotals(payout)
  return (
    <p className="rd-follow fine">
      <Link className="ic" aria-hidden="true" />
      {' '}Follows round {roundLabel(parentPredictionId)} · {signedPoints(payout.parentDelta)} kept
      {' · '}Right <b className="up-t">{signedPoints(payout.win)}</b> (pair {signedPoints(pair.win)})
      {' · '}Wrong <b className="down-t">{signedPoints(payout.loss)}</b> (pair {signedPoints(pair.loss)})
    </p>
  )
}

function Dial({ state, secondsRemaining }: { state: WaitReason; secondsRemaining?: number }) {
  const waiting = state === 'WAITING_FOR_DEADLINE'
  const comparing = state === 'CHECKING_PRICE'
  if (waiting) {
    const remaining = secondsRemaining ?? 0
    const progress = Math.max(0, Math.min(1, 1 - remaining / 60))
    return (
      <div className="dial">
        <svg viewBox="0 0 92 92" aria-hidden="true">
          <circle className="dial-track" cx="46" cy="46" r={DIAL_R} />
          <circle
            className="dial-fg"
            cx="46" cy="46" r={DIAL_R}
            strokeDasharray={DIAL_C}
            strokeDashoffset={DIAL_C * (1 - progress)}
          />
        </svg>
        <span role="timer" className="num">{formatDuration(remaining)}</span>
      </div>
    )
  }
  return (
    <div className="dial" aria-hidden="true">
      <svg viewBox="0 0 92 92">
        <circle className="dial-track" cx="46" cy="46" r={DIAL_R} />
        {comparing && <circle className="dial-arc" cx="46" cy="46" r={DIAL_R} />}
      </svg>
      {comparing && <span className="num dial-zero">0:00</span>}
      {state === 'EQUAL_PRICE' && <Equal className="ic dial-equal" aria-hidden="true" />}
      {state === 'PROVIDER_HOLD' && <Pause className="ic dial-hold" aria-hidden="true" />}
    </div>
  )
}

/**
 * Active-round tracking card shown after a prediction is submitted.
 * The latest price is the display quote. It does not settle the round.
 */
export function RoundTicket({
  direction,
  entryPrice,
  entryTime,
  deadline,
  predictionId,
  state = 'WAITING_FOR_DEADLINE',
  secondsRemaining,
  note,
  latestPrice,
  mode = 'STANDARD',
  parentPredictionId,
  autoFocus = false,
  checkedAgoSeconds,
}: Props) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (autoFocus) heading.current?.focus()
  }, [autoFocus])

  const isUp = direction === 'UP'
  const onHold = state === 'EQUAL_PRICE' || state === 'PROVIDER_HOLD'
  const comparing = state !== 'WAITING_FOR_DEADLINE'
  const waitingStep = state === 'WAITING_FOR_DEADLINE'
  const vs = latestPrice ? stance(direction, entryPrice, latestPrice) : null
  const Icon = isUp ? ArrowUp : ArrowDown
  const word = directionWord(direction)

  return (
    <section
      className={`ticket round ${onHold ? 'hold' : isUp ? 'up' : 'down'}`}
      aria-labelledby={PLAY_TITLE_ID}
    >
      <div className="rd-top">
        <div className="rd-main">
          <p className="rd-eyebrow">
            <span className={state === 'PROVIDER_HOLD' ? 'warn' : undefined}>{phaseWord(state)}</span>
            <span className="subtle">Round {roundLabel(predictionId)}</span>
            {mode !== 'STANDARD' && <ModeTag mode={mode} />}
          </p>
          <h1 id={PLAY_TITLE_ID} className="rd-title" tabIndex={-1} ref={heading}>
            You called <span className={isUp ? 'up-t' : 'down-t'}><Icon className="ic" aria-hidden="true" /> {word}</span>
          </h1>
          <p className="rd-sub">{stateDetail(state, deadline)}</p>
          {comparing && checkedAgoSeconds != null && (
            <p className="fine">Checked {checkedAgoSeconds}s ago</p>
          )}
        </div>
        <Dial state={state} secondsRemaining={secondsRemaining} />
      </div>

      {mode !== 'STANDARD' && parentPredictionId && <FollowOn mode={mode} parentPredictionId={parentPredictionId} />}

      <dl className="rd-figs">
        <div>
          <dt className="k">Entry</dt>
          <dd className="v num">{formatUsd(entryPrice)}</dd>
          <dd className="fine">{formatTime(entryTime)}</dd>
        </div>
        <div>
          <dt className="k">Latest</dt>
          <dd className="v num">{latestPrice ? formatUsd(latestPrice) : '—'}</dd>
          <dd className="fine">Not final</dd>
        </div>
        <div>
          <dt className="k">Vs entry</dt>
          <dd className={`v num${vs ? ` stance ${vs.tone}` : ''}`}>{vs ? vs.move : '—'}</dd>
          <dd className={`fine${vs ? ` stance ${vs.tone}` : ''}`}>{vs ? vs.word : '—'}</dd>
        </div>
      </dl>

      {note && <p className="fine rd-note">{note}</p>}

      <ol className="steps" aria-label="Round progress">
        <li className="done">Placed</li>
        <li className={waitingStep ? 'cur' : 'done'} aria-current={waitingStep ? 'step' : undefined}>Waiting</li>
        <li className={comparing ? 'cur' : ''} aria-current={comparing ? 'step' : undefined}>Comparing</li>
        <li>Result</li>
      </ol>

      <p className="fine rd-foot">You can close this page. The round keeps running.</p>
    </section>
  )
}
