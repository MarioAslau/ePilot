/** Every round waits at least this long between its entry and the compared trade. */
export const MINIMUM_WAIT_MS = 60_000

/** An offer stays open this long after its parent settles. */
export const OFFER_WINDOW_MS = 10_000

/** Need more time adds this much to an open offer. */
export const EXTENSION_MS = 20_000

/** Need more time works at most this many times per offer. */
export const MAX_EXTENSIONS = 10
