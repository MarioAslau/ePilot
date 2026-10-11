import { afterEach, describe, expect, it } from 'vitest'
import { markSeenResult, readSeenResult, shouldAnimate } from '../seenResults'

afterEach(() => {
  localStorage.clear()
})

describe('seen results', () => {
  it('animates the first sight and not the stored one', () => {
    expect(shouldAnimate('anon_aaaaaaaa', 'p1')).toBe(true)
    markSeenResult('anon_aaaaaaaa', 'p1')
    expect(shouldAnimate('anon_aaaaaaaa', 'p1')).toBe(false)
  })

  it('keeps a separate marker per player', () => {
    markSeenResult('anon_aaaaaaaa', 'p1')
    expect(shouldAnimate('anon_bbbbbbbb', 'p1')).toBe(true)
  })

  it('uses memory when storage throws', () => {
    const storage = {
      getItem(): string | null {
        throw new Error('blocked')
      },
      setItem(): void {
        throw new Error('blocked')
      },
    }
    expect(shouldAnimate('anon_cccccccc', 'p9', storage)).toBe(true)
    markSeenResult('anon_cccccccc', 'p9', storage)
    expect(readSeenResult('anon_cccccccc', storage)).toBe('p9')
    expect(shouldAnimate('anon_cccccccc', 'p9', storage)).toBe(false)
  })
})
