import { evaluate } from 'contracts'
import type { TickerQuote } from './coinbase.js'
import { tradeIsEntryFresh, type PredictionRecord } from './prediction.js'

export type Decision =
  | { status: 'TOO_EARLY' }
  | { status: 'PROVIDER_HOLD' }
  | { status: 'EQUAL_PRICE' }
  | {
      status: 'RESOLVED'
      outcome: 'WIN' | 'LOSS'
      scoreDelta: 1 | -1
      resolutionPrice: string
      resolutionTradeTime: string
      resolutionFetchedAt: string
    }

type Decidable = Pick<PredictionRecord, 'createdAt' | 'dueAt' | 'direction' | 'entryPrice'>

/**
 * Decide a resolution attempt. A clock before dueAt returns TOO_EARLY
 * without looking at a quote. The exchange trade time, not the fetch time,
 * is what evaluate() compares with createdAt.
 */
export function decide(prediction: Decidable, now: Date, quote?: TickerQuote): Decision {
  if (now.getTime() < new Date(prediction.dueAt).getTime()) return { status: 'TOO_EARLY' }
  if (!quote || !tradeIsEntryFresh(quote.tradeTime, now)) return { status: 'PROVIDER_HOLD' }

  const result = evaluate({
    direction: prediction.direction,
    entryPrice: prediction.entryPrice,
    resolutionPrice: quote.price,
    createdAt: prediction.createdAt,
    resolvedAt: quote.tradeTime,
  })
  if (result.status === 'TOO_EARLY') return { status: 'TOO_EARLY' }
  if (result.status === 'EQUAL_PRICE') return { status: 'EQUAL_PRICE' }
  return {
    status: 'RESOLVED',
    outcome: result.outcome,
    scoreDelta: result.scoreDelta,
    resolutionPrice: quote.price,
    resolutionTradeTime: quote.tradeTime,
    resolutionFetchedAt: quote.fetchedAt,
  }
}
