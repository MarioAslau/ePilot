import type { ScoreDelta } from 'contracts'
import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react'
import { REDEMPTION_NAME } from '../featureNames'
import { roundLabel } from '../offer'
import { DoubleDownBadge } from './DoubleDownBadge'
import { ModeBadge } from './ModeBadge'

interface Props {
  outcome: 'WIN' | 'LOSS'
  direction: 'UP' | 'DOWN'
  entryPrice: string
  resolutionPrice: string
  entryTime: Date
  resolutionTime: Date
  fetchedAt?: Date
  settledAt?: Date
  predictionId: string
  scoreDelta?: ScoreDelta
  parent?: { predictionId: string; scoreDelta: ScoreDelta }
  followOn?: 'DOUBLE_DOWN' | 'REDEMPTION'
}

function formatPrice(raw: string): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * Settlement result card.
 * Shows outcome (WIN/LOSS), point delta, and the two prices used in the comparison.
 * The resolutionTime comes from the Coinbase ticker `time` field (D1).
 */
function elapsed(from: Date, to: Date): string {
  const seconds = Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000))
  return `${seconds}s`
}

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
  scoreDelta,
  parent,
  followOn,
}: Props) {
  const isWin  = outcome === 'WIN'
  const isUp   = direction === 'UP'
  const points = scoreDelta ?? (isWin ? 1 : -1)
  const redemption = followOn === 'REDEMPTION'
  const bonus = parent !== undefined && !redemption
  const pair = parent ? parent.scoreDelta + points : points
  const word = direction === 'DOWN' ? 'Down' : 'Up'
  const sameDisplay = formatPrice(entryPrice) === formatPrice(resolutionPrice) && entryPrice !== resolutionPrice
  const finishedAt = settledAt ?? resolutionTime

  return (
    <aside className={`receipt ${isWin ? 'win' : 'loss'}`} aria-label={`Result: ${outcome}`}>
      <div className="rc-top">
        <div>
          {redemption && <ModeBadge mode="REDEMPTION" />}
          {bonus && <DoubleDownBadge />}
          <p className="rc-title" id="receipt-heading" tabIndex={-1}>
            {redemption
              ? (isWin ? `${REDEMPTION_NAME} round correct` : `${REDEMPTION_NAME} round missed`)
              : bonus
                ? (isWin ? 'Bonus round correct' : 'Bonus round missed')
                : (isWin ? 'Correct' : 'Not this time')}
          </p>
          <p className="rc-sub">
            {redemption
              ? <>You called {word}. Compared with the {REDEMPTION_NAME} entry.</>
              : isUp
                ? <><ChevronUp className="ic" size={12} aria-hidden="true" /> Predicted Up</>
                : <><ChevronDown className="ic" size={12} aria-hidden="true" /> Predicted Down</>}
          </p>
        </div>

        <div className="rc-pts num" aria-label={`${points > 0 ? 'plus' : 'minus'} ${Math.abs(points)} points`}>
          {points > 0
            ? <><Plus className="ic" size={18} aria-hidden="true" />{points}</>
            : <><Minus className="ic" size={18} aria-hidden="true" />{Math.abs(points)}</>}
        </div>
      </div>
      {redemption && parent && (
        <p className="dd-pair" aria-label={`Pair total ${pair > 0 ? 'plus' : 'minus'} ${Math.abs(pair)}: ${parent.scoreDelta > 0 ? 'plus' : 'minus'} ${Math.abs(parent.scoreDelta)} from round ${roundLabel(parent.predictionId)}, ${points > 0 ? 'plus' : 'minus'} ${Math.abs(points)} from the ${REDEMPTION_NAME} round`}>
          Round {roundLabel(parent.predictionId)} <b>{parent.scoreDelta > 0 ? `+${parent.scoreDelta}` : `−${Math.abs(parent.scoreDelta)}`}</b>
          {` + ${REDEMPTION_NAME} `}<b>{points > 0 ? `+${points}` : `−${Math.abs(points)}`}</b>
          {' · Pair total '}<b>{pair > 0 ? `+${pair}` : `−${Math.abs(pair)}`}</b>
        </p>
      )}
      {bonus && parent && (
        <p className="dd-pair" aria-label={`Round ${roundLabel(parent.predictionId)} plus ${parent.scoreDelta}, bonus ${points > 0 ? 'plus' : 'minus'} ${Math.abs(points)}. Pair total ${pair > 0 ? 'plus' : 'minus'} ${Math.abs(pair)}. `}>
          Round {roundLabel(parent.predictionId)} <b>{parent.scoreDelta > 0 ? `+${parent.scoreDelta}` : `−${Math.abs(parent.scoreDelta)}`}</b>
          {' + Bonus '}<b>{points > 0 ? `+${points}` : `−${Math.abs(points)}`}</b>
          {' · Pair total '}<b>{pair > 0 ? `+${pair}` : `−${Math.abs(pair)}`}</b>
        </p>
      )}

      <dl className="kv">
        <div>
          <dt>{redemption ? `${REDEMPTION_NAME} entry` : bonus ? 'Bonus entry' : 'Entry price'}</dt>
          <dd className="num">{formatPrice(entryPrice)}</dd>
        </div>
        <div>
          <dt>Resolution price</dt>
          <dd className="num">{formatPrice(resolutionPrice)}</dd>
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
          <dd>{formatTime(finishedAt)}</dd>
        </div>
      </dl>

      <p className="fine">
        Compared {elapsed(entryTime, resolutionTime)} after the entry trade. Exact prices decide the result, not the rounded display.
        Round #{predictionId.slice(-6).toUpperCase()}.
      </p>
    </aside>
  )
}
