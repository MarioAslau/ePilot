import {
  CreatePlayerResponseSchema,
  ErrorCodeSchema,
  MeResponseSchema,
  OfferSchema,
  PredictionHistoryResponseSchema,
  PredictionSchema,
  type Direction,
  type ErrorCode,
  type MeResponse,
  type Offer,
  type Prediction,
  type PredictionHistoryResponse,
} from 'contracts'
import type { Session } from './session'

export class HttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`HTTP ${status}`)
    this.name = 'HttpError'
    this.status = status
  }
}

export async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new HttpError(response.status)
  return response.json()
}

function authHeaders(session: Session): Record<string, string> {
  return { Authorization: `Bearer ${session.playerId}.${session.accessToken}` }
}

export async function createPlayer(baseUrl: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/players`, { method: 'POST' })
  return CreatePlayerResponseSchema.parse(await readJson(response))
}

export async function fetchMe(baseUrl: string, session: Session): Promise<MeResponse> {
  const response = await fetch(`${baseUrl}/me`, { headers: authHeaders(session), signal: AbortSignal.timeout(8_000) })
  return MeResponseSchema.parse(await readJson(response))
}

export async function fetchHistory(
  baseUrl: string,
  session: Session,
  cursor: string | null,
): Promise<PredictionHistoryResponse> {
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : ''
  const response = await fetch(`${baseUrl}/predictions${query}`, { headers: authHeaders(session), signal: AbortSignal.timeout(8_000) })
  return PredictionHistoryResponseSchema.parse(await readJson(response))
}

/**
 * The result of a write the server may or may not have applied.
 * `unknown` means no answer arrived, so the caller must reconcile before trying something new.
 */
type WriteResult<T> = { kind: 'ok'; value: T } | { kind: 'rejected'; code: ErrorCode } | { kind: 'unknown' }

const REJECTED = new Set([400, 401, 409, 503])

async function postJson<T>(
  url: string,
  session: Session,
  body: unknown,
  parse: (value: unknown) => T,
  timeoutMs: number,
): Promise<WriteResult<T>> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { ...authHeaders(session), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.status === 200 || response.status === 201) return { kind: 'ok', value: parse(await response.json()) }
    if (!REJECTED.has(response.status)) return { kind: 'unknown' }
    const error = (await response.json().catch(() => null)) as { code?: unknown } | null
    const code = ErrorCodeSchema.safeParse(error?.code)
    return { kind: 'rejected', code: code.success ? code.data : 'INVALID_INPUT' }
  } catch {
    return { kind: 'unknown' }
  }
}

export function postPrediction(
  baseUrl: string,
  session: Session,
  direction: Direction,
  idempotencyKey: string,
): Promise<WriteResult<Prediction>> {
  return postJson(`${baseUrl}/predictions`, session, { direction, idempotencyKey }, (value) => PredictionSchema.parse(value), 10_000)
}

export function postOffer(
  baseUrl: string,
  session: Session,
  offerId: string,
  action: 'accept' | 'decline' | 'extend',
  idempotencyKey?: string,
  direction?: Direction,
): Promise<WriteResult<Prediction | Offer>> {
  const url = `${baseUrl}/offers/${encodeURIComponent(offerId)}/${action}`
  const body = idempotencyKey ? { idempotencyKey, ...(direction ? { direction } : {}) } : undefined
  return postJson(url, session, body, (value) => (action === 'accept' ? PredictionSchema.parse(value) : OfferSchema.parse(value)), 8_000)
}
