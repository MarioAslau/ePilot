import type { Mode } from 'contracts'
import { ArrowDown, ArrowUp, Check, ChevronDown, X } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { REDEMPTION_NAME } from '../featureNames'
import { formatUsd } from '../money'
import { pairFromHistory, type HistoryEntry } from '../offer'
import { runningScores, scoreSeries, type HistoryRound } from '../state/history'
import { DoubleDownBadge } from './DoubleDownBadge'
import { ModeBadge } from './ModeBadge'
import { StatusNotice } from './StatusNotice'

export interface PendingRound {
  direction: 'UP' | 'DOWN'
  entryPrice: string
  entryTradeTime: string
  mode?: Mode
  phase: 'waiting' | 'comparing' | 'hold'
  score: number
}

const PREVIEW = 5
const DESK = '(min-width: 960px)'
const ROW_FLOOR = 152

/** Open-list cap: the first two stage sections, never the special-round offer. */
export function roundsCap(parts: {
  market: number
  play: number
  offer: number
  score: number
  head: number
  pad: number
}): number {
  const two = parts.market + parts.play - parts.offer
  return Math.max(ROW_FLOOR, Math.round(two - parts.score - parts.head - parts.pad))
}

function useRoundsCap(desk: boolean) {
  const [cap, setCap] = useState<number | null>(null)
  useEffect(() => {
    if (!desk || typeof ResizeObserver !== 'function') return
    const measure = () => {
      const market = document.querySelector('.stage-market')
      const play = document.querySelector('.stage-play')
      const score = document.querySelector('.ledger-score')
      if (!market || !play || !score) return
      const offer = play.querySelector('.dd')
      const offerStyle = offer ? getComputedStyle(offer) : null
      const offerHeight = offer
        ? offer.getBoundingClientRect().height + parseFloat(offerStyle?.marginTop || '0') + parseFloat(offerStyle?.marginBottom || '0')
        : 0
      const rounds = document.querySelector('.ledger-rounds')
      const roundsStyle = rounds ? getComputedStyle(rounds) : null
      const pad = roundsStyle ? parseFloat(roundsStyle.paddingTop) + parseFloat(roundsStyle.paddingBottom) : 0
      const head = document.querySelector('.rounds-toggle')?.getBoundingClientRect().height ?? 0
      const next = roundsCap({
        market: market.getBoundingClientRect().height,
        play: play.getBoundingClientRect().height,
        offer: offerHeight,
        score: score.getBoundingClientRect().height,
        head,
        pad,
      })
      setCap((current) => (current === next ? current : next))
    }
    const observer = new ResizeObserver(measure)
    document.querySelectorAll('.card.stage, .ledger-score').forEach((el) => observer.observe(el))
    measure()
    return () => observer.disconnect()
  }, [desk])
  return cap
}

function useDesk() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia?.(DESK)
      if (!query) return () => undefined
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => window.matchMedia?.(DESK)?.matches ?? false,
    () => false,
  )
}

function points(delta: number): string {
  return delta > 0 ? `+${delta}` : `−${Math.abs(delta)}`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function duration(from: string, to: string): string {
  const seconds = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

function phaseWord(phase: PendingRound['phase']): string {
  if (phase === 'hold') return 'On hold'
  if (phase === 'comparing') return 'Comparing'
  return 'Waiting'
}

function titlePrefix(mode: Mode | undefined, bonus: boolean): string {
  if (mode === 'REDEMPTION') return `${REDEMPTION_NAME} `
  if (bonus || mode === 'DOUBLE_DOWN') return 'Bonus '
  return ''
}

function roundTitle(round: Pick<HistoryRound, 'direction' | 'mode' | 'entryTradeTime' | 'parentPredictionId'>, bonus = false): string {
  const word = round.direction === 'UP' ? 'Up' : 'Down'
  return `${titlePrefix(round.mode, bonus || Boolean(round.parentPredictionId))}${word} at ${formatTime(round.entryTradeTime)}`
}

function ScoreChart({ current, deltas }: { current: number; deltas: number[] }) {
  const series = scoreSeries(current, deltas)
  const rounds = deltas.length
  const min = Math.min(0, ...series)
  const max = Math.max(0, ...series)
  const span = max - min || 1
  const width = 240
  const height = 48
  const yOf = (value: number) => 6 + (1 - (value - min) / span) * (height - 12)
  const xOf = (index: number) => (index / (series.length - 1 || 1)) * width
  let path = `M 0 ${yOf(series[0] ?? 0)}`
  series.forEach((value, index) => {
    if (index === 0) return
    path += ` H ${xOf(index)} V ${yOf(value)}`
  })
  const zeroY = yOf(0)
  const from = series[0] ?? current
  const to = series[series.length - 1] ?? current
  return (
    <div className="score-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Score over your last ${rounds} rounds, from ${from} to ${to}`}>
        <line className="score-zero" x1="0" y1={zeroY} x2={width} y2={zeroY} />
        <text className="score-zero-label" x="2" y={zeroY < 12 ? zeroY + 9 : zeroY - 3}>0</text>
        <path d={path} fill="none" stroke="#D5DAE1" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="score-dot" style={{ top: `${(yOf(to) / height) * 100}%` }} />
      <div className="spark-axis">
        <span>{rounds} rounds ago</span>
        <span>Now</span>
      </div>
    </div>
  )
}

function RoundRow({
  round,
  running,
  bonus = false,
  labelled = true,
}: {
  round: HistoryRound
  running: number
  bonus?: boolean
  labelled?: boolean
}) {
  const up = round.direction === 'UP'
  const win = round.outcome === 'WIN'
  const entry = formatUsd(round.entryPrice)
  const compared = formatUsd(round.resolutionPrice)
  const sameDisplay = entry === compared && round.entryPrice !== round.resolutionPrice
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <li id={labelled ? `history-${round.predictionId}` : undefined} tabIndex={labelled ? -1 : undefined}>
      <Icon className={`ic hd-ic ${up ? 'up-t' : 'down-t'}`} size={16} aria-hidden="true" />
      <div className="hm">
        <b>{roundTitle(round, bonus)}</b>
        <span className="num">
          {entry}
          <span className="price-arrow" aria-hidden="true" />
          <span className="sr-only"> to </span>
          {compared}
          {' · '}
          {duration(round.entryTradeTime, round.resolutionTradeTime)}
        </span>
        {sameDisplay && (
          <span className="exact num">Exact {round.entryPrice} vs {round.resolutionPrice}</span>
        )}
      </div>
      <span className={`hp num ${win ? 'win' : 'loss'}`}>
        <span className="sr-only">{win ? 'Correct, ' : 'Not this time, '}</span>
        {points(round.scoreDelta)}
        <small className="run-score">Score {running}</small>
      </span>
    </li>
  )
}

function PairRow({ entry, scores }: { entry: Extract<HistoryEntry, { kind: 'pair' }>; scores: Map<string, number> }) {
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
        <RoundRow round={entry.bonus} running={scores.get(entry.bonus.predictionId) ?? 0} bonus labelled={false} />
        <RoundRow round={entry.parent} running={scores.get(entry.parent.predictionId) ?? 0} labelled={false} />
      </ol>
    </li>
  )
}

function PendingRow({ pending }: { pending: PendingRound }) {
  const up = pending.direction === 'UP'
  const Icon = up ? ArrowUp : ArrowDown
  const word = pending.direction === 'UP' ? 'Up' : 'Down'
  return (
    <li className="pending-row">
      <Icon className="ic hd-ic hd-pending" size={16} aria-hidden="true" />
      <div className="hm">
        <b>{titlePrefix(pending.mode, false)}{word} at {formatTime(pending.entryTradeTime)}</b>
        <span className="num">
          <span className="phase-word">{phaseWord(pending.phase)}</span>
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

interface Props {
  score: number
  wins: number
  losses: number
  flash?: 'win' | 'loss' | null
  stale?: boolean
  status: 'loading' | 'ready' | 'error'
  predictions: HistoryRound[]
  hasMore: boolean
  loadingMore: boolean
  pageError: boolean
  onLoadMore: () => void
  onRetry: () => void
  pending?: PendingRound | null
}

export function LedgerCard({
  score,
  wins,
  losses,
  flash,
  stale = false,
  status,
  predictions,
  hasMore,
  loadingMore,
  pageError,
  onLoadMore,
  onRetry,
  pending = null,
}: Props) {
  const settled = wins + losses
  const accuracy = settled > 0 ? Math.round((wins / settled) * 100) : null
  const showFlash = flash && !(score === 0 && settled === 0) ? flash : null
  const scoreClass = [
    'score-num num',
    score < 0 ? 'neg' : '',
    showFlash === 'win' ? 'flash-win' : '',
    showFlash === 'loss' ? 'flash-loss' : '',
  ].filter(Boolean).join(' ')

  const after = runningScores(score, predictions.map((row) => row.scoreDelta))
  const scores = new Map(predictions.map((row, index) => [row.predictionId, after[index] ?? score]))
  const entries = pairFromHistory(predictions)
  const desk = useDesk()
  const cap = useRoundsCap(desk)
  const [open, setOpen] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const shown = desk || expanded ? entries : entries.slice(0, PREVIEW)
  const canToggle = desk ? hasMore : entries.length > PREVIEW || hasMore

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

  function showAll() {
    if (desk) {
      if (!hasMore) return
      pendingFocus.current = true
      previousCount.current = predictions.length
      onLoadMore()
      return
    }
    if (expanded && !hasMore) {
      setExpanded(false)
      return
    }
    setExpanded(true)
    if (hasMore) {
      pendingFocus.current = true
      previousCount.current = predictions.length
      onLoadMore()
    }
  }

  const showError = status === 'error' || pageError
  const toggleLabel = loadingMore
    ? 'Loading older rounds'
    : desk || hasMore
      ? 'Show all rounds'
      : expanded
        ? 'Show fewer'
        : `Show all ${entries.length} rounds`

  return (
    <section className="card ledger" aria-labelledby="ledger-title">
      <div className="ledger-score">
        <div className="score-board">
          <div>
            <h2 className="label" id="ledger-title">{stale ? 'Last confirmed' : 'Your score'}</h2>
            <div
              className={scoreClass}
              aria-label={stale ? `Last confirmed score: ${score}` : `Score: ${score}`}
            >
              {score > 0 ? `+${score}` : score}
            </div>
          </div>
          {settled > 0 && (
            <div className="score-stats">
              <div>
                <span className="fine">Correct</span>
                <b className="num up-t">{wins}</b>
              </div>
              <div>
                <span className="fine">Wrong</span>
                <b className="num down-t">{losses}</b>
              </div>
              {accuracy !== null && (
                <div>
                  <span className="fine">Accuracy</span>
                  <b className="num">{accuracy}%</b>
                </div>
              )}
            </div>
          )}
        </div>
        {settled === 0 && (
          <p className="fine score-start">Everyone starts at 0, and scores can go below zero. Saved to this browser, no account needed.</p>
        )}
        {predictions.length >= 2 && <ScoreChart current={score} deltas={predictions.map((row) => row.scoreDelta)} />}
      </div>
      <div className="ledger-divider" />
      <section className="ledger-rounds" aria-labelledby="rounds-title">
        <div className="hist-head">
          <h3 className="h2" id="rounds-title">
            <button
              type="button"
              className="rounds-toggle"
              aria-expanded={open}
              onClick={() => setOpen((current) => !current)}
            >
              Your rounds
              <ChevronDown className="ic" size={16} aria-hidden="true" />
            </button>
          </h3>
          <span className="fine">{predictions.length} settled</span>
        </div>
        {open && status === 'loading' && (
          <>
            <span className="sk hist-sk" />
            <span className="sk hist-sk" />
          </>
        )}
        {open && status === 'ready' && predictions.length === 0 && !pending && (
          <p className="empty">No rounds yet. Each settled round appears here with its prices and how it changed your score.</p>
        )}
        {open && showError && (
          <StatusNotice
            kind="warn"
            message="Could not load your rounds."
            action={{ label: 'Retry', onClick: onRetry }}
          />
        )}
        {open && pending && (
          <ol className="hist hist-pending">
            <PendingRow pending={pending} />
          </ol>
        )}
        {open && shown.length > 0 && (
          <ol
            className={!desk && expanded ? 'hist is-open' : 'hist'}
            style={desk && cap != null ? { maxHeight: cap } : undefined}
          >
            {shown.map((entry) => (
              entry.kind === 'pair'
                ? <PairRow key={entry.bonus.predictionId} entry={entry} scores={scores} />
                : <RoundRow key={entry.round.predictionId} round={entry.round} running={scores.get(entry.round.predictionId) ?? score} />
            ))}
          </ol>
        )}
        {open && status !== 'loading' && canToggle && (
          <p className="hist-more">
            <button
              type="button"
              className="btn"
              aria-expanded={desk ? undefined : expanded}
              onClick={showAll}
              disabled={loadingMore}
            >
              {toggleLabel}
            </button>
          </p>
        )}
      </section>
    </section>
  )
}
