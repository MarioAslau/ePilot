import { scoreDelta as scoreFor, type Direction, type Mode, type Outcome, type ScoreDelta } from 'contracts'
import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react'
import { directionWord, formatTime, formatUsd, roundLabel, signedPoints, spokenPoints } from '../format'
import { RECEIPT_HEADING_ID } from '../focusTargets'
import { MODE_DISPLAY } from '../offerCopy'
import { ModeBadge } from './ModeBadge'

interface Props {
  outcome: Outcome
  direction: Direction
  entryPrice: string
  resolutionPrice: string
  entryTime: Date
  resolutionTime: Date
  fetchedAt?: Date
  settledAt?: Date
  predictionId: string
  mode?: Mode
  scoreDelta?: ScoreDelta
  /** The kept parent round of a bonus round. */
  parent?: { predictionId: string; scoreDelta: ScoreDelta }
}

function elapsed(from: Date, to: Date): string {
  return `${Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000))}s`
}

/**
 * Settlement result card.
 * Shows outcome, point delta, and the two prices used in the comparison.
 * The resolution time comes from the Coinbase ticker `time` field (D1).
 */
export function ResultReceipt({
  outcome,
  direction,
  entryPrice,
  resolutionPrice,
  entryTime,
  resolutionTime,
  fetchedAt,
  settledAt,
  predictionId,
  mode = 'STANDARD',
  scoreDelta,
  parent,
}: Props) {
  const isWin = outcome === 'WIN'
  const points = scoreDelta ?? scoreFor(mode, outcome)
  const roundName = mode === 'STANDARD' ? null : MODE_DISPLAY[mode].roundName
  const title = roundName ? `${roundName} round ${isWin ? 'correct' : 'missed'}` : isWin ? 'Correct' : 'Not this time'
  const sameDisplay = formatUsd(entryPrice) === formatUsd(resolutionPrice) && entryPrice !== resolutionPrice
  const Chevron = direction === 'UP' ? ChevronUp : ChevronDown

  return (
    <aside className={`receipt ${isWin ? 'win' : 'loss'}`} aria-label={`Result: ${outcome}`}>
      <div className="rc-top">
        <div>
          {mode !== 'STANDARD' && <ModeBadge mode={mode} />}
          <p className="rc-title" id={RECEIPT_HEADING_ID} tabIndex={-1}>{title}</p>
          <p className="rc-sub">
            {mode === 'REDEMPTION'
              ? <>You called {directionWord(direction)}. Compared with the {roundName} entry.</>
              : <><Chevron className="ic" size={12} aria-hidden="true" /> Predicted {directionWord(direction)}</>}
          </p>
        </div>

        <div className="rc-pts num" aria-label={`${spokenPoints(points)} points`}>
          {points > 0
            ? <><Plus className="ic" size={18} aria-hidden="true" />{points}</>
            : <><Minus className="ic" size={18} aria-hidden="true" />{Math.abs(points)}</>}
        </div>
      </div>
      {roundName && parent && (
        <PairLine roundName={roundName} parent={parent} points={points} />
      )}

      <dl className="kv">
        <div>
          <dt>{roundName ? `${roundName} entry` : 'Entry price'}</dt>
          <dd className="num">{formatUsd(entryPrice)}</dd>
        </div>
        <div>
          <dt>Resolution price</dt>
          <dd className="num">{formatUsd(resolutionPrice)}</dd>
          {sameDisplay && <dd className="fine">Exact {entryPrice} vs {resolutionPrice}</dd>}
        </div>
        <div>
          <dt>Entry trade</dt>
          <dd>{formatTime(entryTime)}</dd>
        </div>
        <div>
          <dt>Compared trade</dt>
          <dd>{formatTime(resolutionTime)}</dd>
        </div>
        {fetchedAt && (
          <div>
            <dt>Fetched</dt>
            <dd>{formatTime(fetchedAt)}</dd>
          </div>
        )}
        <div>
          <dt>Settled</dt>
          <dd>{formatTime(settledAt ?? resolutionTime)}</dd>
        </div>
      </dl>

      <p className="fine">
        Compared {elapsed(entryTime, resolutionTime)} after the entry trade. Exact prices decide the result, not the rounded display.
        Round {roundLabel(predictionId)}.
      </p>
    </aside>
  )
}

function PairLine({
  roundName,
  parent,
  points,
}: {
  roundName: string
  parent: { predictionId: string; scoreDelta: ScoreDelta }
  points: number
}) {
  const pair = parent.scoreDelta + points
  const label = `Pair total ${spokenPoints(pair)}: ${spokenPoints(parent.scoreDelta)} from round ${roundLabel(parent.predictionId)}, ${spokenPoints(points)} from the ${roundName} round`
  return (
    <p className="dd-pair" aria-label={label}>
      Round {roundLabel(parent.predictionId)} <b>{signedPoints(parent.scoreDelta)}</b>
      {` + ${roundName} `}<b>{signedPoints(points)}</b>
      {' · Pair total '}<b>{signedPoints(pair)}</b>
    </p>
  )
}
