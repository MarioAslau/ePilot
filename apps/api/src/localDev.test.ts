import { describe, expect, it } from 'vitest'
import { createLocalApp } from './localDev.js'

describe('local prediction faults', () => {
  it('fails the next quote without writing a round', async () => {
    const app = createLocalApp()
    const created = await app.handle('POST', '/api/players', undefined, undefined)
    const player = JSON.parse(created?.body ?? '') as { playerId: string; accessToken: string }
    const armed = await app.handle(
      'POST',
      '/api/__dev/next-prediction',
      undefined,
      JSON.stringify({ mode: 'provider-down' }),
    )
    expect(armed?.statusCode).toBe(204)

    const denied = await app.handle(
      'POST',
      '/api/predictions',
      `Bearer ${player.playerId}.${player.accessToken}`,
      JSON.stringify({
        direction: 'UP',
        idempotencyKey: '11111111-1111-4111-8111-111111111111',
      }),
      app.consumeFault(),
    )
    expect(denied?.statusCode).toBe(503)

    const me = await app.handle(
      'GET',
      '/api/me',
      `Bearer ${player.playerId}.${player.accessToken}`,
      undefined,
    )
    expect(JSON.parse(me?.body ?? '').activePrediction).toBeNull()
  })

  it('lists only the signed-in player and starts empty', async () => {
    const app = createLocalApp()
    const created = await app.handle('POST', '/api/players', undefined, undefined)
    const player = JSON.parse(created?.body ?? '') as { playerId: string; accessToken: string }
    const denied = await app.handle('GET', '/api/predictions', undefined, undefined)
    expect(denied?.statusCode).toBe(401)
    const history = await app.handle(
      'GET',
      '/api/predictions',
      `Bearer ${player.playerId}.${player.accessToken}`,
      undefined,
    )
    expect(JSON.parse(history?.body ?? '')).toEqual({ predictions: [], nextCursor: null })
  })
})
