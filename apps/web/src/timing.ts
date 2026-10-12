import { EXTENSION_MS, MINIMUM_WAIT_MS, OFFER_WINDOW_MS } from 'contracts'

/** Rule timings in whole seconds, for copy and countdowns. The rules live in contracts. */
export const WAIT_SECONDS = MINIMUM_WAIT_MS / 1000
export const OFFER_SECONDS = OFFER_WINDOW_MS / 1000
export const EXTENSION_SECONDS = EXTENSION_MS / 1000
