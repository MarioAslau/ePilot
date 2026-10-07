import type { Direction, Outcome, PriceString } from './index.js'

const MINIMUM_WAIT_MS = 60_000

export type EvaluatorInput = {
  direction: Direction
  entryPrice: PriceString
  resolutionPrice: PriceString
  /** ISO 8601. Injected by the caller — this function does not read the clock. */
  createdAt: string
  /** ISO 8601. Injected by the caller. */
  resolvedAt: string
  /** Defaults to 60 seconds. Production callers must not pass a shorter wait. */
  minimumWaitMs?: number
}

export type EvaluatorResult =
  | { status: 'TOO_EARLY' }
  | { status: 'EQUAL_PRICE' }
  | { status: 'RESOLVED'; outcome: Outcome; scoreDelta: 1 | -1 }

/**
 * Compare the recorded entry price with a post-deadline resolution price.
 * Returns before any price comparison if the minimum wait has not elapsed.
 */
export function evaluate(input: EvaluatorInput): EvaluatorResult {
  const createdMs = Date.parse(input.createdAt)
  const resolvedMs = Date.parse(input.resolvedAt)
  if (Number.isNaN(createdMs) || Number.isNaN(resolvedMs)) {
    throw new Error('Invalid timestamp')
  }

  const waitMs = input.minimumWaitMs ?? MINIMUM_WAIT_MS
  if (resolvedMs - createdMs < waitMs) {
    return { status: 'TOO_EARLY' }
  }

  const comparison = compareDecimalStrings(input.entryPrice, input.resolutionPrice)
  if (comparison === 0) {
    return { status: 'EQUAL_PRICE' }
  }

  const priceRose = comparison < 0
  const win = input.direction === 'UP' ? priceRose : !priceRose
  return {
    status: 'RESOLVED',
    outcome: win ? 'WIN' : 'LOSS',
    scoreDelta: win ? 1 : -1,
  }
}

/**
 * Align decimal scales and compare with BigInt.
 * "65432.10" and "65432.1" are equal. Never uses parseFloat.
 */
function compareDecimalStrings(left: string, right: string): -1 | 0 | 1 {
  const [leftWhole, leftFrac = ''] = left.split('.')
  const [rightWhole, rightFrac = ''] = right.split('.')
  const scale = Math.max(leftFrac.length, rightFrac.length)
  const leftInt = BigInt(`${leftWhole ?? '0'}${leftFrac.padEnd(scale, '0')}`)
  const rightInt = BigInt(`${rightWhole ?? '0'}${rightFrac.padEnd(scale, '0')}`)
  if (leftInt < rightInt) return -1
  if (leftInt > rightInt) return 1
  return 0
}
