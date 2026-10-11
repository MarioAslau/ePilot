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

export function activeRound(requestId: string) {
  return json(409, {
    code: 'ACTIVE_ROUND',
    message: 'You already have an active prediction',
    requestId,
  })
}

export function idempotencyConflict(requestId: string) {
  return json(409, {
    code: 'IDEMPOTENCY_CONFLICT',
    message: 'This idempotency key was used for a different direction',
    requestId,
  })
}
