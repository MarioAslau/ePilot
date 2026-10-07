import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'

/**
 * GET /health
 * Basic deployment connectivity check.
 * Deployed and wired in T04.
 */
export const handler: APIGatewayProxyHandlerV2 = async () => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'ok' }),
  }
}
