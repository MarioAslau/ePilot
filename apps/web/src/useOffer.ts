import { OFFER_RULES, type Direction, type ErrorCode, type Offer } from 'contracts'
import { useEffect, useRef, useState } from 'react'
import { postOffer } from './api'
import { ACCEPT_FAILED } from './offerCopy'
import { readSeenOffers, rememberSeenOffer } from './seenOffers'
import type { Session } from './session'

type Mutation = 'accept' | 'decline' | 'extend'

/** Rejections that mean the offer is over. Refresh and show how it ended instead of an error. */
const ENDED: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'OFFER_EXPIRED',
  'OFFER_ACCEPTED',
  'OFFER_DECLINED',
  'OFFER_REPLACED',
  'OFFER_NOT_FOUND',
  'ACTIVE_ROUND',
  'IDEMPOTENCY_CONFLICT',
])

export function useOffer(
  baseUrl: string,
  session: Session | null,
  offer: Offer | null | undefined,
  serverNowMs: number,
  onFinished: () => void,
) {
  const [mutation, setMutation] = useState<Mutation | null>(null)
  /** Guards against a second click before React re-renders with the first mutation. */
  const inFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [acceptKey, setAcceptKey] = useState<string | null>(null)
  const [acceptDirection, setAcceptDirection] = useState<Direction | null>(null)
  const initialSeen = useRef(readSeenOffers())
  const [seenOfferIds, setSeen] = useState<Set<string>>(() => new Set(initialSeen.current))
  const [restoredOfferId, setRestored] = useState<string | null>(null)
  const [dismissedOfferIds, setDismissed] = useState<Set<string>>(() => new Set())
  const [acceptedHereOfferId, setAcceptedHere] = useState<string | null>(null)
  const [replacedHereOfferId, setReplacedHere] = useState<string | null>(null)

  useEffect(() => {
    if (!offer || offer.status !== 'OPEN' || serverNowMs >= new Date(offer.expiresAt).getTime()) return
    if (initialSeen.current.includes(offer.offerId)) setRestored(offer.offerId)
    setSeen((current) => {
      if (current.has(offer.offerId)) return current
      return new Set(rememberSeenOffer(offer.offerId))
    })
  }, [offer, serverNowMs])

  /** Run one offer request at a time. */
  async function run<T>(kind: Mutation, request: (current: Offer, player: Session) => Promise<T>): Promise<T | undefined> {
    if (!session || !offer || inFlight.current) return undefined
    inFlight.current = true
    setMutation(kind)
    try {
      return await request(offer, session)
    } finally {
      inFlight.current = false
      setMutation(null)
    }
  }

  async function accept(direction?: Direction) {
    if (!session || !offer || inFlight.current) return
    // A fixed-direction mode ignores the choice. Otherwise a retry keeps the first choice.
    const chosen = OFFER_RULES[offer.mode].directionFixed ? undefined : (acceptDirection ?? direction)
    if (!OFFER_RULES[offer.mode].directionFixed && !chosen) return
    const key = acceptKey ?? crypto.randomUUID()
    setAcceptKey(key)
    if (chosen) setAcceptDirection(chosen)
    setError(null)
    const result = await run('accept', (current, player) => postOffer(baseUrl, player, current.offerId, 'accept', key, chosen))
    if (!result) return
    if (result.kind === 'ok') {
      setAcceptedHere(offer.offerId)
      onFinished()
      return
    }
    if (result.kind === 'rejected' && ENDED.has(result.code)) {
      onFinished()
      return
    }
    setError(ACCEPT_FAILED[offer.mode])
  }

  async function decline() {
    const result = await run('decline', (current, player) => postOffer(baseUrl, player, current.offerId, 'decline'))
    if (result?.kind === 'ok') onFinished()
  }

  async function extend() {
    const result = await run('extend', (current, player) => postOffer(baseUrl, player, current.offerId, 'extend'))
    if (result?.kind === 'ok') onFinished()
  }

  function dismiss(offerId: string) {
    setDismissed((current) => new Set(current).add(offerId))
  }

  return {
    mutation,
    error,
    acceptDirection,
    seenOfferIds,
    restoredOfferId,
    dismissedOfferIds,
    acceptedHereOfferId,
    replacedHereOfferId,
    markReplacedHere: setReplacedHere,
    accept,
    decline,
    extend,
    dismiss,
  }
}
