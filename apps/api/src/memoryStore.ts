import type { PlayerRecord, PlayerStore } from './playerStore.js'
import type { IdempotencyRecord, PredictionRecord } from './prediction.js'
import type { PredictionStore } from './predictionStore.js'

type StoredPlayer = PlayerRecord & { activePredictionId?: string }

/**
 * Synchronous check-then-write. Two calls cannot both pass the lock
 * because the function does not await between the checks and the writes.
 */
export function memoryGameStore(): PlayerStore & PredictionStore {
  const players = new Map<string, StoredPlayer>()
  const predictions = new Map<string, PredictionRecord>()
  const idempotency = new Map<string, IdempotencyRecord>()

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

    async create({ prediction, idempotency: record }) {
      const player = players.get(prediction.playerId)
      const idempotencyId = `${prediction.playerId}#${record.idempotencyKey}`
      if (idempotency.has(idempotencyId)) return 'duplicate_key'
      if (!player || player.activePredictionId) return 'active_round'
      predictions.set(`${prediction.playerId}#${prediction.predictionId}`, prediction)
      idempotency.set(idempotencyId, record)
      player.activePredictionId = prediction.predictionId
      return 'created'
    },
  }
}
