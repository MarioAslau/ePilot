import { PredictionSchema, type Direction, type Prediction } from 'contracts'
import type { Session } from './session'

export type PredictionPostResult =
  | { kind: 'placed'; prediction: Prediction }
  | { kind: 'rejected'; code: string }
  | { kind: 'unknown' }

const REJECTED = new Set([400, 401, 409, 503])

export async function postPrediction(
  baseUrl: string,
  session: Session,
  direction: Direction,
  idempotencyKey: string,
): Promise<PredictionPostResult> {
  try {
    const response = await fetch(`${baseUrl}/predictions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.playerId}.${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ direction, idempotencyKey }),
      signal: AbortSignal.timeout(10_000),
    })
    if (response.status === 200 || response.status === 201) {
      return { kind: 'placed', prediction: PredictionSchema.parse(await response.json()) }
    }
    if (REJECTED.has(response.status)) {
      let code = 'INVALID_INPUT'
      try {
        const body = (await response.json()) as { code?: unknown }
        if (typeof body.code === 'string') code = body.code
      } catch {
        code = 'INVALID_INPUT'
      }
      return { kind: 'rejected', code }
    }
    return { kind: 'unknown' }
  } catch {
    return { kind: 'unknown' }
  }
}
