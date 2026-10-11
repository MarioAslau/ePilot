import type { Offer } from 'contracts'
import type { HistoryRound } from './components/RoundHistory'

export type OfferPhase = 'open' | 'submitting' | 'expired' | 'declined' | 'used' | 'replaced'

export interface OfferLocal {
  seenOfferIds: ReadonlySet<string>
  dismissedOfferIds: ReadonlySet<string>
  acceptedHereOfferId: string | null
  replacedHereOfferId: string | null
  mutation: 'accept' | 'decline' | 'extend' | null
}

export function roundLabel(predictionId: string): string {
  return `#${predictionId.slice(-6).toUpperCase()}`
}

export function offerPhase(offer: Offer | null | undefined, local: OfferLocal, serverNowMs: number): OfferPhase | null {
  if (!offer) return null
  if (local.dismissedOfferIds.has(offer.offerId)) return null
  if (local.replacedHereOfferId === offer.offerId) return null
  const open = offer.status === 'OPEN' && serverNowMs < new Date(offer.expiresAt).getTime()
  if (open) return local.mutation === 'accept' ? 'submitting' : 'open'
  if (!local.seenOfferIds.has(offer.offerId)) return null
  if (offer.status === 'OPEN' || offer.status === 'EXPIRED') return 'expired'
  if (offer.status === 'DECLINED') return 'declined'
  if (offer.status === 'ACCEPTED') return local.acceptedHereOfferId === offer.offerId ? null : 'used'
  if (offer.status === 'REPLACED') return 'replaced'
  return null
}

export type HistoryEntry =
  | { kind: 'round'; round: HistoryRound }
  | { kind: 'pair'; bonus: HistoryRound; parent: HistoryRound; total: number }

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

export function winOfferAnnouncement(score: number, direction: 'UP' | 'DOWN'): string {
  const word = direction === 'DOWN' ? 'down' : 'up'
  return `Result: correct, plus 1 point. Your score is now ${score}. Double down offer: your plus 1 is kept. You can play one bonus round, same direction, ${word}. If right, plus 2, pair total plus 3. If wrong, minus 2, pair total minus 1. The offer ends in 10 seconds; use Need more time to extend it.`
}

export function bonusResultAnnouncement(outcome: 'WIN' | 'LOSS', score: number): string {
  if (outcome === 'WIN') return `Bonus round correct, plus 2 points. Pair total plus 3. Your score is now ${score}.`
  return `Bonus round missed, minus 2 points. Pair total minus 1. Your score is now ${score}.`
}
