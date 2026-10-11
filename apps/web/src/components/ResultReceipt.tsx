import type { ScoreDelta } from 'contracts'
import { ChevronDown, ChevronUp, Minus, Plus } from 'lucide-react'
import { roundLabel } from '../offer'
import { DoubleDownBadge } from './DoubleDownBadge'

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
}: Props) {
  const isWin  = outcome === 'WIN'
  const isUp   = direction === 'UP'
  const points = scoreDelta ?? (isWin ? 1 : -1)
  const bonus = parent !== undefined
  const sameDisplay = formatPrice(entryPrice) === formatPrice(resolutionPrice) && entryPrice !== resolutionPrice
  const finishedAt = settledAt ?? resolutionTime

  return (
    <aside className={`receipt ${isWin ? 'win' : 'loss'}`} aria-label={`Result: ${outcome}`}>
      <div className="rc-top">
        <div>
          {bonus && <DoubleDownBadge />}
          <p className="rc-title" id="receipt-heading" tabIndex={-1}>
            {bonus ? (isWin ? 'Bonus round correct' : 'Bonus round missed') : (isWin ? 'Correct' : 'Not this time')}
          </p>
          <p className="rc-sub">
            {isUp
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
      {bonus && parent && (
        <p className="dd-pair" aria-label={`Round ${roundLabel(parent.predictionId)} plus ${parent.scoreDelta}, bonus ${points > 0 ? 'plus' : 'minus'} ${Math.abs(points)}. Pair total ${parent.scoreDelta + points > 0 ? 'plus' : 'minus'} ${Math.abs(parent.scoreDelta + points)}. `}>
          Round {roundLabel(parent.predictionId)} <b>{parent.scoreDelta > 0 ? `+${parent.scoreDelta}` : `−${Math.abs(parent.scoreDelta)}`}</b>
          {' + Bonus '}<b>{points > 0 ? `+${points}` : `−${Math.abs(points)}`}</b>
          {' · Pair total '}<b>{parent.scoreDelta + points > 0 ? `+${parent.scoreDelta + points}` : `−${Math.abs(parent.scoreDelta + points)}`}</b>
        </p>
      )}

      <dl className="kv">
        <div>
          <dt>{bonus ? 'Bonus entry' : 'Entry price'}</dt>
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
