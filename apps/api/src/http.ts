import type { ErrorCode } from 'contracts'

export function authorizationHeader(
  headers: Record<string, string | undefined> | undefined,
): string | undefined {
  if (!headers) return undefined
  const found = Object.entries(headers).find(([name]) => name.toLowerCase() === 'authorization')
  return found?.[1]
}

export function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

/** Status and default message for every error code. The body always matches `ErrorResponseSchema`. */
const ERRORS: Record<ErrorCode, { status: number; message: string }> = {
  INVALID_INPUT: { status: 400, message: 'Invalid request' },
  DIRECTION_REQUIRED: { status: 400, message: 'Choose up or down to start this round' },
  UNAUTHORIZED: { status: 401, message: 'Invalid player credentials' },
  OFFER_NOT_FOUND: { status: 404, message: 'Offer not found' },
  ACTIVE_ROUND: { status: 409, message: 'You already have an active prediction' },
  IDEMPOTENCY_CONFLICT: { status: 409, message: 'This idempotency key was already used' },
  OFFER_EXPIRED: { status: 409, message: 'This offer has ended' },
  OFFER_ACCEPTED: { status: 409, message: 'This offer was already accepted' },
  OFFER_DECLINED: { status: 409, message: 'This offer was declined' },
  OFFER_REPLACED: { status: 409, message: 'This offer was replaced' },
  MAX_EXTENSIONS: { status: 409, message: 'This offer cannot be extended again' },
  INTERNAL_ERROR: { status: 500, message: 'Something went wrong on our side' },
  PROVIDER_UNAVAILABLE: { status: 503, message: 'Price source is unavailable' },
}

export function errorResponse(code: ErrorCode, requestId: string, message = ERRORS[code].message) {
  return json(ERRORS[code].status, { code, message, requestId })
}
