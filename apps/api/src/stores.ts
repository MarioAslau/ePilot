import { documentClient } from './dynamo.js'
import { dynamoPlayerStore, type PlayerStore } from './playerStore.js'
import { dynamoPredictionStore, type PredictionStore } from './predictionStore.js'

export interface GameStores {
  players: PlayerStore
  predictions: PredictionStore
}

let stores: GameStores | undefined

/** One DynamoDB client and one pair of stores per warm Lambda container. */
export function productionStores(): GameStores {
  if (!stores) {
    const doc = documentClient()
    stores = { players: dynamoPlayerStore(undefined, doc), predictions: dynamoPredictionStore(undefined, doc) }
  }
  return stores
}
