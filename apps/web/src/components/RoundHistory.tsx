import type { Mode, Prediction, ScoreDelta } from 'contracts'
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { REDEMPTION_NAME } from '../featureNames'
import { pairFromHistory, type HistoryEntry } from '../offer'
import { DoubleDownBadge } from './DoubleDownBadge'
import { ModeBadge } from './ModeBadge'
import { StatusNotice } from './StatusNotice'

export interface HistoryRound {
  predictionId: string
  direction: 'UP' | 'DOWN'
  entryPrice: string
  resolutionPrice: string
  entryTradeTime: string
  resolutionTradeTime: string
  outcome: 'WIN' | 'LOSS'
  scoreDelta: ScoreDelta
  parentPredictionId?: string
  mode?: Mode
}

export function historyRound(prediction: Prediction): HistoryRound | null {
  if (
    prediction.status !== 'RESOLVED'
    || !prediction.resolutionPrice
    || !prediction.resolutionTradeTime
    || !prediction.outcome
    || prediction.scoreDelta === undefined
  ) {
    return null
  }
  return {
    predictionId: prediction.predictionId,
    direction: prediction.direction,
    entryPrice: prediction.entryPrice,
    resolutionPrice: prediction.resolutionPrice,
    entryTradeTime: prediction.entryTradeTime,
    resolutionTradeTime: prediction.resolutionTradeTime,
    outcome: prediction.outcome,
    scoreDelta: prediction.scoreDelta,
    mode: prediction.mode,
    ...(prediction.parentPredictionId ? { parentPredictionId: prediction.parentPredictionId } : {}),
  }
}

function points(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`
}

function formatPrice(raw: string): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function elapsed(from: string, to: string): string {
  const seconds = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000))
  return `${seconds}s`
}

function RoundRow({ round, bonus = false, labelled = true }: { round: HistoryRound; bonus?: boolean; labelled?: boolean }) {
  const up = round.direction === 'UP'
  const win = round.outcome === 'WIN'
  const entry = formatPrice(round.entryPrice)
  const compared = formatPrice(round.resolutionPrice)
  const sameDisplay = entry === compared && round.entryPrice !== round.resolutionPrice
  return (
    <li id={labelled ? `history-${round.predictionId}` : undefined} tabIndex={labelled ? -1 : undefined}>
      <span className={`hd ${up ? 'up' : 'down'}`} aria-hidden="true">
        {up
          ? <ChevronUp className="ic" size={16} aria-hidden="true" />
          : <ChevronDown className="ic" size={16} aria-hidden="true" />}
      </span>
      <div className="hm">
        <b>{round.mode === 'REDEMPTION' ? `${REDEMPTION_NAME} ` : bonus || round.parentPredictionId || round.mode === 'DOUBLE_DOWN' ? 'Bonus ' : ''}{up ? 'Up' : 'Down'} at {formatTime(round.entryTradeTime)}</b>
        <span className="num">
          {entry} to {compared}, settled after {elapsed(round.entryTradeTime, round.resolutionTradeTime)}
        </span>
        {sameDisplay && (
          <span className="exact num">Exact {round.entryPrice} vs {round.resolutionPrice}</span>
        )}
      </div>
      <span className={`hp num ${win ? 'win' : 'loss'}`}>
        <span className="sr-only">{win ? 'Correct, ' : 'Not this time, '}</span>
        {points(round.scoreDelta)}
      </span>
    </li>
  )
}

function PairRow({ entry }: { entry: Extract<HistoryEntry, { kind: 'pair' }> }) {
  const total = points(entry.total)
  const word = entry.total > 0 ? `plus ${entry.total}` : `minus ${Math.abs(entry.total)}`
  const redemption = entry.bonus.mode === 'REDEMPTION'
  const name = redemption ? `${REDEMPTION_NAME} pair` : 'Double Down pair'
  const Mark = entry.total > 0 ? Check : X
  return (
    <li id={`history-${entry.bonus.predictionId}`} tabIndex={-1} className="hist-pair">
      <div className="pair-head">
        {redemption ? <ModeBadge mode="REDEMPTION" label={name} /> : <DoubleDownBadge label={name} />}
        <span className={`hp num ${entry.total > 0 ? 'win' : 'loss'}`}>
          {redemption && <Mark className="ic" size={14} aria-hidden="true" />}
          Pair {total}
        </span>
      </div>
      <ol className="pair" aria-label={`${name}, total ${word}`}>
        <RoundRow round={entry.bonus} bonus labelled={false} />
        <RoundRow round={entry.parent} labelled={false} />
      </ol>
    </li>
  )
}

interface Props {
  status: 'loading' | 'ready' | 'error'
  predictions: HistoryRound[]
  hasMore: boolean
  loadingMore: boolean
  pageError: boolean
  onLoadMore: () => void
  onRetry: () => void
}

export function RoundHistory({
  status,
  predictions,
  hasMore,
  loadingMore,
  pageError,
  onLoadMore,
  onRetry,
}: Props) {
  const pendingFocus = useRef(false)
  const previousCount = useRef(predictions.length)

  useEffect(() => {
    if (!pendingFocus.current) {
      previousCount.current = predictions.length
      return
    }
    if (predictions.length <= previousCount.current) return
    const next = predictions[previousCount.current]
    pendingFocus.current = false
    previousCount.current = predictions.length
    if (!next) return
    document.getElementById(`history-${next.predictionId}`)?.focus()
  }, [predictions])

  function loadMore() {
    pendingFocus.current = true
    previousCount.current = predictions.length
    onLoadMore()
  }

  const showError = status === 'error' || pageError

  return (
    <section className="card" aria-labelledby="hist-title">
      <div className="hist-head">
        <h2 className="h2" id="hist-title">Your rounds</h2>
      </div>
      {status === 'loading' && (
        <>
          <span className="sk hist-sk" />
          <span className="sk hist-sk" />
        </>
      )}
      {status === 'ready' && predictions.length === 0 && (
        <p className="empty">No rounds yet. Your settled predictions appear here with entry and compared prices.</p>
      )}
      {showError && (
        <StatusNotice
          kind="warn"
          message="Could not load your rounds."
          action={{ label: 'Retry', onClick: onRetry }}
        />
      )}
      {predictions.length > 0 && (
        <ol className="hist">
          {pairFromHistory(predictions).map((entry) => (
            entry.kind === 'pair'
              ? <PairRow key={entry.bonus.predictionId} entry={entry} />
              : <RoundRow key={entry.round.predictionId} round={entry.round} />
          ))}
        </ol>
      )}
      {status !== 'loading' && hasMore && (
        <p className="hist-more">
          <button type="button" className="btn" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading older rounds' : 'Load older rounds'}
          </button>
        </p>
      )}
      {status === 'ready' && predictions.length > 0 && !hasMore && !pageError && (
        <p className="fine hist-end">All rounds loaded</p>
      )}
    </section>
  )
}
