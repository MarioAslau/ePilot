import type { Direction, Outcome, PriceString, WaitReason } from 'contracts'
import type { HistoryRound } from '../components/RoundHistory'

/**
 * Fixture data for all 9 UI states.
 * Only loaded in development when ?fixture=<name> is present.
 *
 * Available names:
 *   ready | submitting | active | checking | equal-price |
 *   provider-hold | win | loss | setup-error | history | history-empty
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
  | 'history'
  | 'history-empty'
  | 'dd-offer'
  | 'dd-offer-extended'
  | 'dd-submitting'
  | 'dd-expired'
  | 'dd-declined'
  | 'dd-used'
  | 'dd-replaced'
  | 'dd-active'
  | 'dd-win'
  | 'dd-loss'
  | 'dd-history'
  | 'dd-reduced-motion'

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
  'history',
  'history-empty',
  'dd-offer',
  'dd-offer-extended',
  'dd-submitting',
  'dd-expired',
  'dd-declined',
  'dd-used',
  'dd-replaced',
  'dd-active',
  'dd-win',
  'dd-loss',
  'dd-history',
  'dd-reduced-motion',
]

const NOW = new Date('2026-10-06T14:00:00Z')
const LATER = new Date(NOW.getTime() + 75_000)

export interface FixtureState {
  /** Human-readable label for the banner nav */
  label: string
  price: PriceString | null
  priceStatus: 'loading' | 'live' | 'stale' | 'unavailable'
  score: number
  wins: number
  losses: number
  isSubmitting?: boolean
  activeRound?: {
    direction: Direction
    entryPrice: PriceString
    entryTime: Date
    deadline: Date
    predictionId: string
    state: WaitReason
    secondsRemaining?: number
  }
  result?: {
    outcome: Outcome
    direction: Direction
    entryPrice: PriceString
    resolutionPrice: PriceString
    entryTime: Date
    resolutionTime: Date
    predictionId: string
  }
  errorMessage?: string
  flash?: 'win' | 'loss' | null
  history?: HistoryRound[]
  offerPreview?: 'open' | 'extended' | 'submitting' | 'expired' | 'declined' | 'used' | 'replaced'
  doubleDownHelp?: boolean
  bonus?: boolean
}

function ddBase(label: string, extra: Partial<FixtureState> = {}): FixtureState {
  return {
    label,
    price: '65432.10',
    priceStatus: 'live',
    score: 1,
    wins: 1,
    losses: 0,
    doubleDownHelp: true,
    ...extra,
  }
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
      state: 'WAITING_FOR_DEADLINE',
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
      state: 'CHECKING_PRICE',
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
      state: 'EQUAL_PRICE',
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
      state: 'PROVIDER_HOLD',
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

  history: {
    label: 'History',
    price: '65432.10',
    priceStatus: 'live',
    score: -1,
    wins: 1,
    losses: 2,
    history: [
      {
        predictionId: 'p_0000000003000_aaaabbbb',
        direction: 'DOWN',
        entryPrice: '65432.101',
        resolutionPrice: '65432.104',
        entryTradeTime: '2026-10-06T14:02:31.000Z',
        resolutionTradeTime: '2026-10-06T14:03:33.000Z',
        outcome: 'LOSS',
        scoreDelta: -1,
      },
      {
        predictionId: 'p_0000000002000_ccccdddd',
        direction: 'UP',
        entryPrice: '64000.00',
        resolutionPrice: '64120.50',
        entryTradeTime: '2026-10-06T14:00:00.000Z',
        resolutionTradeTime: '2026-10-06T14:01:02.000Z',
        outcome: 'WIN',
        scoreDelta: 1,
      },
    ],
  },

  'history-empty': {
    label: 'History empty',
    price: '65432.10',
    priceStatus: 'live',
    score: 0,
    wins: 0,
    losses: 0,
    history: [],
  },

  'dd-offer': ddBase('DD offer', { offerPreview: 'open' }),
  'dd-offer-extended': ddBase('DD extended', { offerPreview: 'extended' }),
  'dd-submitting': ddBase('DD submitting', { offerPreview: 'submitting' }),
  'dd-expired': ddBase('DD expired', { offerPreview: 'expired' }),
  'dd-declined': ddBase('DD declined', { offerPreview: 'declined' }),
  'dd-used': ddBase('DD used', { offerPreview: 'used', bonus: true, activeRound: {
    direction: 'UP', entryPrice: '65432.10', entryTime: NOW, deadline: LATER, predictionId: 'p_0000000003000_eeeeffff', state: 'WAITING_FOR_DEADLINE', secondsRemaining: 40,
  } }),
  'dd-replaced': ddBase('DD replaced', { offerPreview: 'replaced', activeRound: {
    direction: 'DOWN', entryPrice: '65432.10', entryTime: NOW, deadline: LATER, predictionId: 'p_0000000003000_eeeeffff', state: 'WAITING_FOR_DEADLINE', secondsRemaining: 40,
  } }),
  'dd-active': ddBase('DD active', { bonus: true, activeRound: {
    direction: 'UP', entryPrice: '65432.10', entryTime: NOW, deadline: LATER, predictionId: 'p_0000000003000_eeeeffff', state: 'WAITING_FOR_DEADLINE', secondsRemaining: 40,
  } }),
  'dd-win': ddBase('DD win', { bonus: true, score: 3, wins: 2, result: {
    outcome: 'WIN', direction: 'UP', entryPrice: '65432.10', resolutionPrice: '65500.00', entryTime: NOW, resolutionTime: LATER, predictionId: 'p_0000000003000_eeeeffff',
  } }),
  'dd-loss': ddBase('DD loss', { bonus: true, score: -1, wins: 1, losses: 1, result: {
    outcome: 'LOSS', direction: 'UP', entryPrice: '65432.10', resolutionPrice: '65000.00', entryTime: NOW, resolutionTime: LATER, predictionId: 'p_0000000003000_eeeeffff',
  } }),
  'dd-history': ddBase('DD history', { score: 3, wins: 2, history: [
    {
      predictionId: 'p_0000000003000_eeeeffff', direction: 'UP', entryPrice: '65432.10', resolutionPrice: '65500.00',
      entryTradeTime: '2026-10-06T14:02:00.000Z', resolutionTradeTime: '2026-10-06T14:03:02.000Z', outcome: 'WIN', scoreDelta: 2,
      parentPredictionId: 'p_0000000002000_ccccdddd',
    },
    {
      predictionId: 'p_0000000002000_ccccdddd', direction: 'UP', entryPrice: '64000.00', resolutionPrice: '64120.50',
      entryTradeTime: '2026-10-06T14:00:00.000Z', resolutionTradeTime: '2026-10-06T14:01:02.000Z', outcome: 'WIN', scoreDelta: 1,
    },
  ] }),
  'dd-reduced-motion': ddBase('DD reduced motion', { offerPreview: 'open' }),
}
