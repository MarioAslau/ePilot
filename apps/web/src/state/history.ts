import type { Direction, Mode, Outcome, Prediction, ScoreDelta } from 'contracts'

/** A settled round with every field the history list shows. */
export interface HistoryRound {
  predictionId: string
  direction: Direction
  mode: Mode
  entryPrice: string
  resolutionPrice: string
  entryTradeTime: string
  resolutionTradeTime: string
  outcome: Outcome
  scoreDelta: ScoreDelta
  parentPredictionId?: string
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

export type HistoryEntry =
  | { kind: 'round'; round: HistoryRound }
  | { kind: 'pair'; bonus: HistoryRound; parent: HistoryRound; total: number }

/** Group a bonus round with the parent listed right after it. Rows are newest first. */
export function pairFromHistory(rows: HistoryRound[]): HistoryEntry[] {
  const entries: HistoryEntry[] = []
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]
    const older = rows[index + 1]
    if (row?.parentPredictionId && older && older.predictionId === row.parentPredictionId) {
      entries.push({ kind: 'pair', bonus: row, parent: older, total: row.scoreDelta + older.scoreDelta })
      index += 1
      continue
    }
    if (row) entries.push({ kind: 'round', round: row })
  }
  return entries
}

/** Score immediately after each listed round, newest first. The first value is the current score. */
export function runningScores(currentScore: number, deltasNewestFirst: readonly number[]): number[] {
  const scores: number[] = []
  let after = currentScore
  for (const delta of deltasNewestFirst) {
    scores.push(after)
    after -= delta
  }
  return scores
}

/**
 * Chart values, oldest first. The first value is the score before the oldest
 * listed round, so a truncated page still starts from the current score.
 */
export function scoreSeries(currentScore: number, deltasNewestFirst: readonly number[]): number[] {
  const oldestFirst = [...deltasNewestFirst].reverse()
  let score = currentScore - oldestFirst.reduce((sum, delta) => sum + delta, 0)
  const points = [score]
  for (const delta of oldestFirst) {
    score += delta
    points.push(score)
  }
  return points
}
