import type { Direction, Mode } from 'contracts'
import { ArrowDown, ArrowUp, Check, ChevronDown, X } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { directionWord, formatDuration, formatTime, formatUsd, signedPoints, spokenPoints } from '../../format'
import { MODE_DISPLAY } from '../../offerCopy'
import { pairFromHistory, runningScores, type HistoryEntry, type HistoryRound } from '../../state/history'
import { ModeBadge } from '../ModeBadge'
import { StatusNotice } from '../StatusNotice'

export interface PendingRound {
  direction: Direction
  entryPrice: string
  entryTradeTime: string
  mode: Mode
  phase: 'waiting' | 'comparing' | 'hold'
  score: number
}

const PREVIEW = 5

const PHASE_WORD: Record<PendingRound['phase'], string> = { waiting: 'Waiting', comparing: 'Comparing', hold: 'On hold' }

function roundTitle(round: { direction: Direction; mode: Mode; entryTradeTime: string }): string {
  const prefix = round.mode === 'STANDARD' ? '' : `${MODE_DISPLAY[round.mode].roundName} `
  return `${prefix}${directionWord(round.direction)} at ${formatTime(round.entryTradeTime)}`
}

function DirectionIcon({ direction, className }: { direction: Direction; className: string }) {
  const Icon = direction === 'UP' ? ArrowUp : ArrowDown
  return <Icon className={`ic hd-ic ${className}`} size={16} aria-hidden="true" />
}

function RoundRow({ round, running, labelled = true }: { round: HistoryRound; running: number; labelled?: boolean }) {
  const win = round.outcome === 'WIN'
  const entry = formatUsd(round.entryPrice)
  const compared = formatUsd(round.resolutionPrice)
  const sameDisplay = entry === compared && round.entryPrice !== round.resolutionPrice
  const seconds = (new Date(round.resolutionTradeTime).getTime() - new Date(round.entryTradeTime).getTime()) / 1000
  return (
    <li id={labelled ? `history-${round.predictionId}` : undefined} tabIndex={labelled ? -1 : undefined}>
      <DirectionIcon direction={round.direction} className={round.direction === 'UP' ? 'up-t' : 'down-t'} />
      <div className="hm">
        <b>{roundTitle(round)}</b>
        <span className="num">
          {entry}
          <span className="price-arrow" aria-hidden="true" />
          <span className="sr-only"> to </span>
          {compared}
          {' · '}
          {formatDuration(seconds)}
        </span>
        {sameDisplay && <span className="exact num">Exact {round.entryPrice} vs {round.resolutionPrice}</span>}
      </div>
      <span className={`hp num ${win ? 'win' : 'loss'}`}>
        <span className="sr-only">{win ? 'Correct, ' : 'Not this time, '}</span>
        {signedPoints(round.scoreDelta)}
        <small className="run-score">Score {running}</small>
      </span>
    </li>
  )
}

function PairRow({ entry, scores }: { entry: Extract<HistoryEntry, { kind: 'pair' }>; scores: Map<string, number> }) {
  const mode = entry.bonus.mode === 'REDEMPTION' ? 'REDEMPTION' : 'DOUBLE_DOWN'
  const name = `${MODE_DISPLAY[mode].name} pair`
  const Mark = entry.total > 0 ? Check : X
  return (
    <li id={`history-${entry.bonus.predictionId}`} tabIndex={-1} className="hist-pair">
      <div className="pair-head">
        <ModeBadge mode={mode} label={name} />
        <span className={`hp num ${entry.total > 0 ? 'win' : 'loss'}`}>
          {mode === 'REDEMPTION' && <Mark className="ic" size={14} aria-hidden="true" />}
          Pair {signedPoints(entry.total)}
        </span>
      </div>
      <ol className="pair" aria-label={`${name}, total ${spokenPoints(entry.total)}`}>
        <RoundRow round={entry.bonus} running={scores.get(entry.bonus.predictionId) ?? 0} labelled={false} />
        <RoundRow round={entry.parent} running={scores.get(entry.parent.predictionId) ?? 0} labelled={false} />
      </ol>
    </li>
  )
}

function PendingRow({ pending }: { pending: PendingRound }) {
  return (
    <li className="pending-row">
      <DirectionIcon direction={pending.direction} className="hd-pending" />
      <div className="hm">
        <b>{roundTitle(pending)}</b>
        <span className="num">
          <span className="phase-word">{PHASE_WORD[pending.phase]}</span>
          {' · entry '}
          {formatUsd(pending.entryPrice)}
        </span>
      </div>
      <span className="hp">
        Pending
        <small className="run-score">Score {pending.score}</small>
      </span>
    </li>
  )
}

/** Move focus to the first newly loaded row after "Show all rounds" fetches another page. */
function useFocusFirstLoaded(predictions: HistoryRound[]) {
  const pending = useRef(false)
  const previousCount = useRef(predictions.length)
  useEffect(() => {
    if (!pending.current) {
      previousCount.current = predictions.length
      return
    }
    if (predictions.length <= previousCount.current) return
    const next = predictions[previousCount.current]
    pending.current = false
    previousCount.current = predictions.length
    if (next) document.getElementById(`history-${next.predictionId}`)?.focus()
  }, [predictions])
  return () => {
    pending.current = true
    previousCount.current = predictions.length
  }
}

export function RoundsList({
  score,
  status,
  predictions,
  hasMore,
  loadingMore,
  pageError,
  onLoadMore,
  onRetry,
  pending,
  desk,
  cap,
  roundsRef,
  headRef,
}: {
  score: number
  status: 'loading' | 'ready' | 'error'
  predictions: HistoryRound[]
  hasMore: boolean
  loadingMore: boolean
  pageError: boolean
  onLoadMore: () => void
  onRetry: () => void
  pending: PendingRound | null
  desk: boolean
  /** Desktop list height cap, in pixels. */
  cap: number | null
  roundsRef: RefObject<HTMLElement>
  headRef: RefObject<HTMLButtonElement>
}) {
  const [open, setOpen] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const focusNextLoaded = useFocusFirstLoaded(predictions)

  const entries = pairFromHistory(predictions)
  const after = runningScores(score, predictions.map((row) => row.scoreDelta))
  const scores = new Map(predictions.map((row, index) => [row.predictionId, after[index] ?? score]))
  const shown = desk || expanded ? entries : entries.slice(0, PREVIEW)
  const canToggle = desk ? hasMore : entries.length > PREVIEW || hasMore
  const showError = status === 'error' || pageError
  const listStyle: CSSProperties | undefined = desk && cap != null ? { maxHeight: cap } : undefined

  function loadMore() {
    focusNextLoaded()
    onLoadMore()
  }

  function showAll() {
    if (desk) {
      if (hasMore) loadMore()
      return
    }
    if (expanded && !hasMore) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (hasMore) loadMore()
  }

  const toggleLabel = loadingMore
    ? 'Loading older rounds'
    : desk || hasMore
      ? 'Show all rounds'
      : expanded
        ? 'Show fewer'
        : `Show all ${entries.length} rounds`

  return (
    <section className="ledger-rounds" aria-labelledby="rounds-title" ref={roundsRef}>
      <div className="hist-head">
        <h3 className="h2" id="rounds-title">
          <button type="button" className="rounds-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)} ref={headRef}>
            Your rounds
            <ChevronDown className="ic" size={16} aria-hidden="true" />
          </button>
        </h3>
        <span className="fine">{predictions.length} settled</span>
      </div>
      {open && (
        <>
          {status === 'loading' && (
            <>
              <span className="sk hist-sk" />
              <span className="sk hist-sk" />
            </>
          )}
          {status === 'ready' && predictions.length === 0 && !pending && (
            <p className="empty">No rounds yet. Each settled round appears here with its prices and how it changed your score.</p>
          )}
          {showError && <StatusNotice kind="warn" message="Could not load your rounds." action={{ label: 'Retry', onClick: onRetry }} />}
          {pending && (
            <ol className="hist hist-pending">
              <PendingRow pending={pending} />
            </ol>
          )}
          {shown.length > 0 && (
            <ol className={!desk && expanded ? 'hist is-open' : 'hist'} style={listStyle}>
              {shown.map((entry) =>
                entry.kind === 'pair'
                  ? <PairRow key={entry.bonus.predictionId} entry={entry} scores={scores} />
                  : <RoundRow key={entry.round.predictionId} round={entry.round} running={scores.get(entry.round.predictionId) ?? score} />,
              )}
            </ol>
          )}
          {status !== 'loading' && canToggle && (
            <p className="hist-more">
              <button type="button" className="btn" aria-expanded={desk ? undefined : expanded} onClick={showAll} disabled={loadingMore}>
                {toggleLabel}
              </button>
            </p>
          )}
        </>
      )}
    </section>
  )
}
