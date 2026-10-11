export function authorizationHeader(
  headers: Record<string, string | undefined> | undefined,
): string | undefined {
  if (!headers) return undefined
  const found = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === 'authorization',
  )
  return found?.[1]
}

export function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

export function unauthorized(requestId: string) {
  return json(401, {
    code: 'UNAUTHORIZED',
    message: 'Invalid player credentials',
    requestId,
  })
}

export function providerUnavailable(requestId: string) {
  return json(503, {
    code: 'PROVIDER_UNAVAILABLE',
    message: 'Price source is unavailable',
    requestId,
  })
}

export function invalidInput(requestId: string) {
  return json(400, {
    code: 'INVALID_INPUT',
    message: 'Invalid prediction request',
    requestId,
  })
}

export function directionRequired(requestId: string) {
  return json(400, {
    code: 'DIRECTION_REQUIRED',
    message: 'Choose up or down to start this round',
    requestId,
  })
}

export function activeRound(requestId: string) {
  return json(409, {
    code: 'ACTIVE_ROUND',
    message: 'You already have an active prediction',
    requestId,
  })
}

export function idempotencyConflict(requestId: string, scope: 'direction' | 'offer' = 'direction') {
  return json(409, {
    code: 'IDEMPOTENCY_CONFLICT',
    message:
      scope === 'offer'
        ? 'This idempotency key was already used'
        : 'This idempotency key was used for a different direction',
    requestId,
  })
}

const OFFER_MESSAGE = {
  OFFER_NOT_FOUND: 'Offer not found',
  OFFER_EXPIRED: 'This offer has ended',
  OFFER_ACCEPTED: 'This offer was already accepted',
  OFFER_DECLINED: 'This offer was declined',
  OFFER_REPLACED: 'This offer was replaced',
  MAX_EXTENSIONS: 'This offer cannot be extended again',
} as const

export function offerError(
  requestId: string,
  code: keyof typeof OFFER_MESSAGE,
) {
  return json(code === 'OFFER_NOT_FOUND' ? 404 : 409, {
    code,
    message: OFFER_MESSAGE[code],
    requestId,
  })
}
