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
