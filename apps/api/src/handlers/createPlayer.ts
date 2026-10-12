import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { CreatePlayerResponseSchema } from 'contracts'
import { json } from '../http.js'
import { createPlayer } from '../player.js'
import type { PlayerStore } from '../playerStore.js'
import { productionStores } from '../stores.js'

const MAX_ID_ATTEMPTS = 3

export async function handleCreatePlayer(
  requestId: string,
  deps: {
    store: PlayerStore
    now?: () => Date
    nextBytes?: (size: number) => Buffer
  },
) {
  const now = deps.now ?? (() => new Date())
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
    const created = createPlayer(now(), deps.nextBytes)
    const outcome = await deps.store.putNew(created)
    if (outcome === 'created') {
      return json(
        200,
        CreatePlayerResponseSchema.parse({
          playerId: created.playerId,
          accessToken: created.accessToken,
        }),
      )
    }
  }
  return json(500, {
    message: 'Could not create a player',
    requestId,
  })
}

export const handler: APIGatewayProxyHandlerV2 = async (event) =>
  handleCreatePlayer(event.requestContext.requestId, { store: productionStores().players })
