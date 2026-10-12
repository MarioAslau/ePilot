import { OFFER_RULES, scoreDelta, type MeResponse, type Offer } from 'contracts'
import { useEffect, useRef, useState } from 'react'
import {
  followOnResultAnnouncement,
  followOnStartedAnnouncement,
  lossOfferAnnouncement,
  OFFER_END_ANNOUNCEMENT,
  WELCOME_BACK,
  winOfferAnnouncement,
} from './announcements'
import { focusById, PLAY_TITLE_ID, RECEIPT_HEADING_ID } from './focusTargets'
import type { OfferPhase } from './offer'
import { announcement, TICKET_PHASES, type RoundPhase, type roundView } from './round'
import { markSeenResult, shouldAnimate } from './seenResults'
import { EXTENSION_SECONDS } from './timing'

const FLASH_MS = 1_000

/**
 * The polite live region, the score flash, and focus moves, driven by round and offer transitions.
 * Each effect compares with the previous value it saw, so a restored page announces nothing stale.
 */
export function useAnnouncer({
  me,
  view,
  offer,
  offerPhase,
  serverNowMs,
  acceptedHereOfferId,
}: {
  me: MeResponse | undefined
  view: ReturnType<typeof roundView>
  offer: Offer | null
  offerPhase: OfferPhase | null
  serverNowMs: number
  acceptedHereOfferId: string | null
}) {
  const [live, setLive] = useState('')
  const [flash, setFlash] = useState<'win' | 'loss' | null>(null)
  /** The settled round that finished while the page was closed, shown with a welcome-back line. */
  const [welcomeBackId, setWelcomeBackId] = useState<string | null>(null)
  const prevPhase = useRef<RoundPhase | null>(null)
  const prevOfferPhase = useRef(offerPhase)
  const prevExpiry = useRef(offer?.expiresAt ?? null)
  const announcedFollowOn = useRef<string | null>(null)
  const focusTitleOnDecline = useRef(false)

  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [flash])

  // Round phase changes: placed, checking, holds, and the settled result.
  useEffect(() => {
    const from = prevPhase.current
    prevPhase.current = view.phase
    const settled = view.settled
    if (view.phase === 'result' && from && TICKET_PHASES.has(from)) focusById(RECEIPT_HEADING_ID)
    if (view.phase === 'result' && me && settled?.outcome) {
      const { predictionId, outcome } = settled
      if (!shouldAnimate(me.playerId, predictionId)) return
      if (me.wins + me.losses > 0 || me.score !== 0) setFlash(outcome === 'WIN' ? 'win' : 'loss')
      if (settled.mode !== 'STANDARD') {
        const delta = settled.scoreDelta ?? scoreDelta(settled.mode, outcome)
        const parentDelta = settled.parent?.scoreDelta ?? OFFER_RULES[settled.mode].payout.parentDelta
        const result = followOnResultAnnouncement(settled.mode, outcome, me.score, parentDelta, delta)
        const welcomeBack = settled.mode === 'REDEMPTION' && from === null
        setWelcomeBackId(welcomeBack ? predictionId : null)
        setLive(welcomeBack ? `${WELCOME_BACK} ${result}` : result)
      } else if (outcome === 'WIN' && offerPhase === 'open') {
        setLive(winOfferAnnouncement(me.score, settled.direction))
      } else if (outcome === 'LOSS' && offerPhase === 'open' && offer) {
        setLive(lossOfferAnnouncement(me.score, offer.payout))
      } else {
        setLive(announcement(from, 'result', { outcome, score: me.score }) ?? '')
      }
      const timer = window.setTimeout(() => markSeenResult(me.playerId, predictionId), 0)
      return () => window.clearTimeout(timer)
    }
    const text = announcement(from, view.phase, { direction: view.active?.direction, entryPrice: view.active?.entryPrice })
    if (text) setLive(text)
  }, [view.phase, view.settled, view.active, me, offerPhase, offer])

  // Offer endings seen in this tab.
  const offerMode = offer?.mode
  useEffect(() => {
    const from = prevOfferPhase.current
    prevOfferPhase.current = offerPhase
    if (!offerMode) return
    const copy = OFFER_END_ANNOUNCEMENT[offerMode]
    if (offerPhase === 'expired' && from === 'open') setLive(copy.expired)
    if (offerPhase === 'declined' && focusTitleOnDecline.current) {
      focusTitleOnDecline.current = false
      focusById(PLAY_TITLE_ID)
      if (copy.declined) setLive(copy.declined)
    }
    if (from === 'submitting' && offerPhase && offerPhase !== 'open' && offerPhase !== 'submitting' && copy.lost) {
      setLive(copy.lost)
    }
  }, [offerPhase, offerMode])

  // More time added, here or in another tab.
  useEffect(() => {
    const expiry = offer?.expiresAt ?? null
    if (prevExpiry.current && expiry && expiry !== prevExpiry.current && offerPhase === 'open') {
      const seconds = Math.max(0, Math.ceil((new Date(expiry).getTime() - serverNowMs) / 1000))
      setLive(`${EXTENSION_SECONDS} seconds added. Offer ends in ${seconds} seconds.`)
    }
    prevExpiry.current = expiry
  }, [offer?.expiresAt, offerPhase, serverNowMs])

  // A bonus round accepted in this tab, announced once.
  useEffect(() => {
    const active = view.active
    if (!acceptedHereOfferId || !active || active.mode === 'STANDARD') return
    if (announcedFollowOn.current === active.predictionId) return
    announcedFollowOn.current = active.predictionId
    setLive(followOnStartedAnnouncement(active.mode, active.direction, active.entryPrice))
    if (active.mode === 'REDEMPTION') focusById(PLAY_TITLE_ID)
  }, [view.active, acceptedHereOfferId])

  return {
    live,
    flash,
    welcomeBackId,
    /** Call before declining, so focus returns to the play title once the decline lands. */
    focusTitleAfterDecline: () => {
      focusTitleOnDecline.current = true
    },
  }
}
