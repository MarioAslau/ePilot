import { EXTENSION_MS, offerExpiresAt, type OfferRecord } from './offer.js'
import type { PlayerRecord, PlayerStore } from './playerStore.js'
import type { IdempotencyRecord, PredictionRecord } from './prediction.js'
import type { PredictionStore } from './predictionStore.js'

type StoredPlayer = PlayerRecord & { activePredictionId?: string }

/**
 * Synchronous check-then-write. Two calls cannot both pass the lock
 * because the function does not await between the checks and the writes.
 */
export function memoryGameStore(): PlayerStore & PredictionStore & { failNextSettle(): void } {
  const players = new Map<string, StoredPlayer>()
  const predictions = new Map<string, PredictionRecord>()
  const idempotency = new Map<string, IdempotencyRecord>()
  const offers = new Map<string, OfferRecord>()
  let failSettle = false

  return {
    async putNew(record) {
      if (players.has(record.playerId)) return 'exists'
      players.set(record.playerId, {
        playerId: record.playerId,
        accessTokenHash: record.accessTokenHash,
        score: record.score,
        wins: record.wins,
        losses: record.losses,
        createdAt: record.createdAt,
      })
      return 'created'
    },

    async get(playerId) {
      return players.get(playerId) ?? null
    },

    async getPrediction(playerId, predictionId) {
      return predictions.get(`${playerId}#${predictionId}`) ?? null
    },

    async getIdempotency(playerId, key) {
      return idempotency.get(`${playerId}#${key}`) ?? null
    },

    async create({ prediction, idempotency: record, replaceOfferId, clearOpenOffer, now }) {
      const player = players.get(prediction.playerId)
      const idempotencyId = `${prediction.playerId}#${record.idempotencyKey}`
      if (idempotency.has(idempotencyId)) return 'duplicate_key'
      if (!player || player.activePredictionId) return 'active_round'
      const offer = replaceOfferId ? offers.get(`${prediction.playerId}#${replaceOfferId}`) : undefined
      if (replaceOfferId) {
        const clock = now ? new Date(now).getTime() : 0
        if (!offer || offer.status !== 'OPEN' || new Date(offer.expiresAt).getTime() <= clock) return 'offer_changed'
        if (player.openOfferId !== replaceOfferId) return 'offer_changed'
      }
      predictions.set(`${prediction.playerId}#${prediction.predictionId}`, prediction)
      idempotency.set(idempotencyId, record)
      player.activePredictionId = prediction.predictionId
      if (offer && replaceOfferId) {
        offer.status = 'REPLACED'
        offer.replacedByPredictionId = prediction.predictionId
        delete player.openOfferId
      } else if (clearOpenOffer) {
        delete player.openOfferId
      }
      return 'created'
    },

    async getOffer(playerId, offerId) {
      return offers.get(`${playerId}#${offerId}`) ?? null
    },

    async acceptOffer({ prediction, idempotency: record, offerId, now }) {
      const player = players.get(prediction.playerId)
      const offer = offers.get(`${prediction.playerId}#${offerId}`)
      const idempotencyId = `${prediction.playerId}#${record.idempotencyKey}`
      if (idempotency.has(idempotencyId)) return 'duplicate_key'
      if (
        !player ||
        !offer ||
        offer.status !== 'OPEN' ||
        new Date(offer.expiresAt).getTime() <= new Date(now).getTime() ||
        player.openOfferId !== offerId ||
        player.activePredictionId
      ) {
        return 'conflict'
      }
      offer.status = 'ACCEPTED'
      offer.bonusPredictionId = prediction.predictionId
      predictions.set(`${prediction.playerId}#${prediction.predictionId}`, prediction)
      idempotency.set(idempotencyId, record)
      player.activePredictionId = prediction.predictionId
      delete player.openOfferId
      return 'accepted'
    },

    async declineOffer(playerId, offerId) {
      const player = players.get(playerId)
      const offer = offers.get(`${playerId}#${offerId}`)
      if (!player || !offer || offer.status !== 'OPEN' || player.openOfferId !== offerId) return 'conflict'
      offer.status = 'DECLINED'
      delete player.openOfferId
      return 'declined'
    },

    async extendOffer(playerId, offerId, seenExpiresAt, now) {
      const offer = offers.get(`${playerId}#${offerId}`)
      if (
        !offer ||
        offer.status !== 'OPEN' ||
        offer.expiresAt !== seenExpiresAt ||
        new Date(offer.expiresAt).getTime() <= new Date(now).getTime() ||
        offer.extensions >= 10
      ) {
        return 'conflict'
      }
      offer.expiresAt = new Date(new Date(seenExpiresAt).getTime() + EXTENSION_MS).toISOString()
      offer.extensions += 1
      return 'extended'
    },

    failNextSettle() {
      failSettle = true
    },

    async settle(input) {
      if (failSettle) {
        failSettle = false
        throw new Error('settle failed')
      }
      const prediction = predictions.get(`${input.playerId}#${input.predictionId}`)
      const player = players.get(input.playerId)
      if (!prediction || prediction.status !== 'PENDING') return 'already_settled'
      if (!player || player.activePredictionId !== input.predictionId) return 'already_settled'
      const next: PredictionRecord = {
        ...prediction,
        status: 'RESOLVED',
        outcome: input.outcome,
        scoreDelta: input.scoreDelta,
        resolutionPrice: input.resolutionPrice,
        resolutionTradeTime: input.resolutionTradeTime,
        resolutionFetchedAt: input.resolutionFetchedAt,
        resolvedAt: input.resolvedAt,
      }
      delete next.pendingKey
      delete next.pendingDueAt
      delete next.lastCheck
      predictions.set(`${input.playerId}#${input.predictionId}`, next)
      player.score += input.scoreDelta
      if (input.outcome === 'WIN') player.wins += 1
      else player.losses += 1
      delete player.activePredictionId
      player.latestResolvedPredictionId = input.predictionId
      if (input.createOffer) {
        const offerId = input.createOffer.offerId
        offers.set(`${input.playerId}#${offerId}`, {
          offerId,
          playerId: input.playerId,
          parentPredictionId: input.createOffer.parentPredictionId,
          direction: input.createOffer.direction,
          issuedAt: input.resolvedAt,
          expiresAt: offerExpiresAt(input.resolvedAt),
          extensions: 0,
          status: 'OPEN',
          createdAt: input.resolvedAt,
        })
        player.openOfferId = offerId
        player.latestOfferId = offerId
      }
      return 'settled'
    },

    async recordCheck(playerId, predictionId, reason, at) {
      const prediction = predictions.get(`${playerId}#${predictionId}`)
      if (!prediction || prediction.status !== 'PENDING') return 'already_settled'
      prediction.lastCheck = { reason, at }
      return 'recorded'
    },

    async listOverdue(before) {
      return [...predictions.values()]
        .filter((prediction) => prediction.pendingKey === 'PENDING' && (prediction.pendingDueAt ?? '') < before)
        .map((prediction) => ({
          playerId: prediction.playerId,
          predictionId: prediction.predictionId,
          dueAt: prediction.pendingDueAt ?? prediction.dueAt,
        }))
    },

    async listResolved(playerId, { limit, startSk }) {
      const startId = startSk?.startsWith('PREDICTION#') ? startSk.slice('PREDICTION#'.length) : undefined
      const rows = [...predictions.values()]
        .filter((prediction) => prediction.playerId === playerId && prediction.status === 'RESOLVED')
        .filter((prediction) => (startId ? prediction.predictionId < startId : true))
        .sort((a, b) => (a.predictionId < b.predictionId ? 1 : -1))
      const page = rows.slice(0, limit)
      const last = page[page.length - 1]
      return {
        items: page,
        nextSk: rows.length > limit && last ? `PREDICTION#${last.predictionId}` : null,
      }
    },

    async clearPending(playerId, predictionId) {
      const prediction = predictions.get(`${playerId}#${predictionId}`)
      if (!prediction) return
      delete prediction.pendingKey
      delete prediction.pendingDueAt
    },
  }
}
