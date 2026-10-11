import { describe, expect, it } from 'vitest'
import { readSeenOffers, rememberSeenOffer } from '../seenOffers'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

describe('seenOffers', () => {
  it('keeps the last 10 ids', () => {
    const storage = memoryStorage()
    for (let index = 0; index < 12; index += 1) rememberSeenOffer(`o_${index}`, storage)
    expect(readSeenOffers(storage)).toEqual(['o_2', 'o_3', 'o_4', 'o_5', 'o_6', 'o_7', 'o_8', 'o_9', 'o_10', 'o_11'])
  })

  it('keeps ids in memory when storage throws', () => {
    const storage = {
      get length() {
        return 0
      },
      clear: () => undefined,
      getItem: () => {
        throw new Error('blocked')
      },
      key: () => null,
      removeItem: () => undefined,
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(rememberSeenOffer('o_kept', storage)).toContain('o_kept')
    expect(readSeenOffers(storage)).toContain('o_kept')
  })
})
