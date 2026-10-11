import { OfferSchema, PredictionSchema, PredictionHistoryResponseSchema, type Direction, type Offer, type Prediction, type PredictionHistoryResponse } from 'contracts'
import { readJson } from './api'
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

export async function fetchHistory(
  baseUrl: string,
  session: Session,
  cursor: string | null,
): Promise<PredictionHistoryResponse> {
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  const query = params.toString()
  const response = await fetch(`${baseUrl}/predictions${query ? `?${query}` : ''}`, {
    headers: {
      Authorization: `Bearer ${session.playerId}.${session.accessToken}`,
    },
    signal: AbortSignal.timeout(8_000),
  })
  return PredictionHistoryResponseSchema.parse(await readJson(response))
}

export type OfferPostResult =
  | { kind: 'ok'; prediction?: Prediction; offer?: Offer }
  | { kind: 'rejected'; code: string }
  | { kind: 'unknown' }

export async function postOffer(
  baseUrl: string,
  session: Session,
  offerId: string,
  action: 'accept' | 'decline' | 'extend',
  idempotencyKey?: string,
): Promise<OfferPostResult> {
  try {
    const response = await fetch(`${baseUrl}/offers/${encodeURIComponent(offerId)}/${action}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.playerId}.${session.accessToken}`,
        ...(idempotencyKey ? { 'Content-Type': 'application/json' } : {}),
      },
      body: idempotencyKey ? JSON.stringify({ idempotencyKey }) : undefined,
      signal: AbortSignal.timeout(8_000),
    })
    if (response.status === 200 || response.status === 201) {
      const body = await response.json()
      if (action === 'accept') return { kind: 'ok', prediction: PredictionSchema.parse(body) }
      return { kind: 'ok', offer: OfferSchema.parse(body) }
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
