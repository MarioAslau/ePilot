import type { Mode, Prediction, ScoreDelta } from 'contracts'

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
