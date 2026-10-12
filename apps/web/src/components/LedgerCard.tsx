import { useRef } from 'react'
import { useDesk } from '../hooks/useDesk'
import { useRoundsCap } from '../hooks/useRoundsCap'
import type { HistoryRound } from '../state/history'
import { RoundsList, type PendingRound } from './ledger/RoundsList'
import { ScoreBoard } from './ledger/ScoreBoard'

export type { PendingRound }

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

/** Right column: the score board above the list of settled rounds. */
export function LedgerCard({ score, wins, losses, flash = null, stale = false, pending = null, ...list }: Props) {
  const scoreRef = useRef<HTMLDivElement>(null)
  const roundsRef = useRef<HTMLElement>(null)
  const headRef = useRef<HTMLButtonElement>(null)
  const desk = useDesk()
  const cap = useRoundsCap(desk, { score: scoreRef, rounds: roundsRef, head: headRef })

  return (
    <section className="card ledger" aria-labelledby="ledger-title">
      <ScoreBoard
        score={score}
        wins={wins}
        losses={losses}
        flash={flash}
        stale={stale}
        deltas={list.predictions.map((row) => row.scoreDelta)}
        scoreRef={scoreRef}
      />
      <div className="ledger-divider" />
      <RoundsList {...list} score={score} pending={pending} desk={desk} cap={cap} roundsRef={roundsRef} headRef={headRef} />
    </section>
  )
}
