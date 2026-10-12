import { memoryGameStore } from './memoryStore.js'
import { runGameStoreContract } from './storeContract.js'

runGameStoreContract('store contract on the memory store', () => {
  const store = memoryGameStore()
  return {
    players: store,
    predictions: store,
    forceActivePrediction: async (playerId, predictionId) => store.forceActivePrediction(playerId, predictionId),
  }
})
