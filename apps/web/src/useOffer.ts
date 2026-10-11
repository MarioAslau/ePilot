import type { Offer } from 'contracts'
import { useEffect, useState } from 'react'
import { postOffer } from './predictions'
import type { Session } from './session'

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
  const [seenOfferIds, setSeen] = useState<Set<string>>(() => new Set())
  const [dismissedOfferIds, setDismissed] = useState<Set<string>>(() => new Set())
  const [acceptedHereOfferId, setAcceptedHere] = useState<string | null>(null)
  const [replacedHereOfferId, setReplacedHere] = useState<string | null>(null)

  useEffect(() => {
    if (!offer || offer.status !== 'OPEN' || serverNowMs >= new Date(offer.expiresAt).getTime()) return
    setSeen((current) => {
      if (current.has(offer.offerId)) return current
      const next = new Set(current)
      next.add(offer.offerId)
      return next
    })
  }, [offer, serverNowMs])

  async function accept() {
    if (!session || !offer || mutation) return
    const key = acceptKey ?? crypto.randomUUID()
    setAcceptKey(key)
    setMutation('accept')
    setError(null)
    const result = await postOffer(baseUrl, session, offer.offerId, 'accept', key)
    setMutation(null)
    if (result.kind === 'ok') {
      setAcceptedHere(offer.offerId)
      onFinished()
      return
    }
    if (result.kind === 'rejected') {
      setAcceptKey(null)
      onFinished()
      if (result.code !== 'OFFER_EXPIRED') {
        setError('Bonus round not started. Your +1 is kept. You can try again while the offer lasts.')
      }
      return
    }
    setError('Bonus round not started. Your +1 is kept. You can try again while the offer lasts.')
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
    seenOfferIds,
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
