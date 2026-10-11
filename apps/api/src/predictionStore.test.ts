import { describe, expect, it } from 'vitest'
import { classifyCancellation } from './predictionStore.js'

describe('classifyCancellation', () => {
  it('treats a failed idempotency condition as a duplicate key', () => {
    expect(
      classifyCancellation([
        { Code: 'None' },
        { Code: 'None' },
        { Code: 'ConditionalCheckFailed' },
      ]),
    ).toBe('duplicate_key')
  })

  it('treats a failed player condition as an active round', () => {
    expect(
      classifyCancellation([
        { Code: 'None' },
        { Code: 'ConditionalCheckFailed' },
        { Code: 'None' },
      ]),
    ).toBe('active_round')
  })

  it('keeps the duplicate-key reason when both conditions fail', () => {
    expect(
      classifyCancellation([
        { Code: 'ConditionalCheckFailed' },
        { Code: 'ConditionalCheckFailed' },
        { Code: 'ConditionalCheckFailed' },
      ]),
    ).toBe('duplicate_key')
  })
})
