/**
 * Fixture data for all 9 UI states.
 * Only loaded in development when ?fixture=<name> is present.
 *
 * Available names:
 *   ready | submitting | active | checking | equal-price |
 *   provider-hold | win | loss | setup-error
 */

export type FixtureName =
  | 'ready'
  | 'submitting'
  | 'active'
  | 'checking'
  | 'equal-price'
  | 'provider-hold'
  | 'win'
  | 'loss'
  | 'setup-error'

export const FIXTURE_NAMES: FixtureName[] = [
  'ready',
  'submitting',
  'active',
  'checking',
  'equal-price',
  'provider-hold',
  'win',
  'loss',
  'setup-error',
]

const NOW = new Date('2026-10-06T14:00:00Z')
const LATER = new Date(NOW.getTime() + 75_000)

export interface FixtureState {
  /** Human-readable label for the banner nav */
  label: string
  price: string | null
  priceStatus: 'loading' | 'live' | 'stale' | 'unavailable'
  score: number
  wins: number
  losses: number
  isSubmitting?: boolean
  activeRound?: {
    direction: 'UP' | 'DOWN'
    entryPrice: string
    entryTime: Date
    deadline: Date
    predictionId: string
    state: 'waiting' | 'checking' | 'equal-price' | 'provider-hold'
    secondsRemaining?: number
  }
  result?: {
    outcome: 'WIN' | 'LOSS'
    direction: 'UP' | 'DOWN'
    entryPrice: string
    resolutionPrice: string
    entryTime: Date
    resolutionTime: Date
    predictionId: string
  }
  errorMessage?: string
  flash?: 'win' | 'loss' | null
}

export const fixtures: Record<FixtureName, FixtureState> = {
  'ready': {
    label: 'Ready',
    price: '65432.10',
    priceStatus: 'live',
    score: 3,
    wins: 5,
    losses: 2,
  },

  'submitting': {
    label: 'Submitting',
    price: '65432.10',
    priceStatus: 'live',
    score: 3,
    wins: 5,
    losses: 2,
    isSubmitting: true,
  },

  'active': {
    label: 'Active round',
    price: '65498.72',
    priceStatus: 'live',
    score: 3,
    wins: 5,
    losses: 2,
    activeRound: {
      direction: 'UP',
      entryPrice: '65432.10',
      entryTime: NOW,
      deadline: LATER,
      predictionId: 'pred-fixture-0001',
      state: 'waiting',
      secondsRemaining: 43,
    },
  },

  'checking': {
    label: 'Checking price',
    price: '65498.72',
    priceStatus: 'live',
    score: 3,
    wins: 5,
    losses: 2,
    activeRound: {
      direction: 'UP',
      entryPrice: '65432.10',
      entryTime: NOW,
      deadline: LATER,
      predictionId: 'pred-fixture-0002',
      state: 'checking',
      secondsRemaining: 0,
    },
  },

  'equal-price': {
    label: 'Equal price',
    price: '65432.10',
    priceStatus: 'live',
    score: 3,
    wins: 5,
    losses: 2,
    activeRound: {
      direction: 'DOWN',
      entryPrice: '65432.10',
      entryTime: NOW,
      deadline: LATER,
      predictionId: 'pred-fixture-0003',
      state: 'equal-price',
      secondsRemaining: 0,
    },
  },

  'provider-hold': {
    label: 'Provider hold',
    price: null,
    priceStatus: 'unavailable',
    score: 3,
    wins: 5,
    losses: 2,
    activeRound: {
      direction: 'UP',
      entryPrice: '65432.10',
      entryTime: NOW,
      deadline: LATER,
      predictionId: 'pred-fixture-0004',
      state: 'provider-hold',
      secondsRemaining: 0,
    },
  },

  'win': {
    label: 'Win',
    price: '65901.33',
    priceStatus: 'live',
    score: 4,
    wins: 6,
    losses: 2,
    flash: 'win',
    result: {
      outcome: 'WIN',
      direction: 'UP',
      entryPrice: '65432.10',
      resolutionPrice: '65901.33',
      entryTime: NOW,
      resolutionTime: LATER,
      predictionId: 'pred-fixture-0005',
    },
  },

  'loss': {
    label: 'Loss',
    price: '64990.01',
    priceStatus: 'live',
    score: 2,
    wins: 5,
    losses: 3,
    flash: 'loss',
    result: {
      outcome: 'LOSS',
      direction: 'UP',
      entryPrice: '65432.10',
      resolutionPrice: '64990.01',
      entryTime: NOW,
      resolutionTime: LATER,
      predictionId: 'pred-fixture-0006',
    },
  },

  'setup-error': {
    label: 'Setup error',
    price: null,
    priceStatus: 'unavailable',
    score: 0,
    wins: 0,
    losses: 0,
    errorMessage: 'Unable to reach the backend. Check VITE_API_BASE_URL in .env.',
  },
}
