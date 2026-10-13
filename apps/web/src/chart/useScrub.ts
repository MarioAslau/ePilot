import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import type { Frame } from './frame'
import { nearestSample } from './model'
import type { PriceSample } from './samples'

/** On touch, scrubbing starts only after a hold this long, so a vertical swipe still scrolls the page. */
const LONG_PRESS_MS = 250
/** A touch that moves this far before the hold ends is a scroll, not a scrub. */
const TOUCH_SLOP_PX = 8
const ANNOUNCE_DEBOUNCE_MS = 300

/**
 * The sample under the pointer or the keyboard cursor.
 * Pointer: hover on move, clear on leave or cancel. Touch: long-press first. Keyboard: Left/Right step, Home/End jump, Escape clears.
 * Keyboard moves are announced politely after a short pause.
 */
export function useScrub(
  lastFrame: RefObject<Frame | null>,
  /** The samples the keyboard steps through: the ones in view. */
  inView: PriceSample[],
  describe: (sample: PriceSample) => string,
) {
  const [hover, setHover] = useState<PriceSample | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const touch = useRef<{ id: number; x: number; y: number; timer: number; active: boolean } | null>(null)
  const announceTimer = useRef(0)

  useEffect(() => () => {
    window.clearTimeout(announceTimer.current)
    if (touch.current) window.clearTimeout(touch.current.timer)
  }, [])

  const hoverAt = (element: HTMLElement, clientX: number) => {
    const frame = lastFrame.current
    if (!frame) return
    const x = clientX - element.getBoundingClientRect().left
    const sample = nearestSample(frame.visible, frame.scale.timeAt(x))
    setHover((current) => (current?.time === sample?.time ? current : sample))
  }

  const clear = () => {
    if (touch.current) window.clearTimeout(touch.current.timer)
    touch.current = null
    setHover(null)
  }

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') {
      hoverAt(event.currentTarget, event.clientX)
      return
    }
    const element = event.currentTarget
    const { pointerId, clientX, clientY } = event
    const timer = window.setTimeout(() => {
      if (!touch.current) return
      touch.current.active = true
      element.setPointerCapture?.(pointerId)
      hoverAt(element, touch.current.x)
    }, LONG_PRESS_MS)
    touch.current = { id: pointerId, x: clientX, y: clientY, timer, active: false }
  }

  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const pressed = touch.current
    if (event.pointerType !== 'touch') {
      hoverAt(event.currentTarget, event.clientX)
      return
    }
    if (!pressed || pressed.id !== event.pointerId) return
    if (pressed.active) {
      hoverAt(event.currentTarget, event.clientX)
      return
    }
    if (Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y) > TOUCH_SLOP_PX) clear()
    else pressed.x = event.clientX
  }

  const onPointerEnd = (event: PointerEvent<HTMLElement>) => {
    if (event.type === 'pointerup' && event.pointerType !== 'touch') return
    clear()
  }

  const announce = (sample: PriceSample | null) => {
    window.clearTimeout(announceTimer.current)
    announceTimer.current = window.setTimeout(() => setAnnouncement(sample ? describe(sample) : ''), ANNOUNCE_DEBOUNCE_MS)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const list = inView
    if (list.length === 0) return
    const index = hover ? list.findIndex((sample) => sample.time === hover.time) : -1
    let next: PriceSample | null | undefined
    if (event.key === 'ArrowLeft') next = list[index === -1 ? list.length - 1 : Math.max(0, index - 1)]
    else if (event.key === 'ArrowRight') next = list[index === -1 ? list.length - 1 : Math.min(list.length - 1, index + 1)]
    else if (event.key === 'Home') next = list[0]
    else if (event.key === 'End') next = list[list.length - 1]
    else if (event.key === 'Escape') next = null
    else return
    event.preventDefault()
    setHover(next ?? null)
    announce(next ?? null)
  }

  return {
    hover,
    announcement,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerLeave: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onKeyDown,
      onBlur: clear,
    },
  }
}
