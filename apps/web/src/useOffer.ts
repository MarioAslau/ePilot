import type { Direction, Offer } from 'contracts'
import { useEffect, useRef, useState } from 'react'
import { postOffer } from './predictions'
import { readSeenOffers, rememberSeenOffer } from './seenOffers'
import type { Session } from './session'

const ENDED = new Set([
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
  const [mutation, setMutation] = useState<'accept' | 'decline' | 'extend' | null>(null)
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

  async function accept(direction?: Direction) {
    if (!session || !offer || mutation) return
    const chosen = offer.mode === 'REDEMPTION' ? (acceptDirection ?? direction) : undefined
    if (offer.mode === 'REDEMPTION' && chosen !== 'UP' && chosen !== 'DOWN') return
    const key = acceptKey ?? crypto.randomUUID()
    setAcceptKey(key)
    if (chosen) setAcceptDirection(chosen)
    setMutation('accept')
    setError(null)
    const result = await postOffer(baseUrl, session, offer.offerId, 'accept', key, chosen)
    setMutation(null)
    if (result.kind === 'ok') {
      setAcceptedHere(offer.offerId)
      onFinished()
      return
    }
    if (result.kind === 'rejected' && ENDED.has(result.code)) {
      onFinished()
      return
    }
    setError(
      offer.mode === 'REDEMPTION'
        ? "We couldn't get a fresh price for the entry. Your −1 is kept. You can try again while the offer lasts."
        : 'Bonus round not started. Your +1 is kept. You can try again while the offer lasts.',
    )
  }

  async function decline() {
    if (!session || !offer || mutation) return
    setMutation('decline')
    const result = await postOffer(baseUrl, session, offer.offerId, 'decline')
    setMutation(null)
    if (result.kind === 'ok') onFinished()
  }

  async function extend() {
    if (!session || !offer || mutation) return
    setMutation('extend')
    const result = await postOffer(baseUrl, session, offer.offerId, 'extend')
    setMutation(null)
    if (result.kind === 'ok') onFinished()
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
