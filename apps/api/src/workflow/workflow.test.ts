import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface ChoiceRule {
  StringEquals?: string
  Next?: string
}
interface WaitState {
  Type?: string
  TimestampPath?: string
  Seconds?: number
  Next?: string
}
interface ChoiceState {
  Type?: string
  Choices?: ChoiceRule[]
}
interface TaskState {
  Type?: string
  Resource?: string
  Next?: string
}

describe('resolution workflow', () => {
  const definition = JSON.parse(
    readFileSync(new URL('./resolution.asl', import.meta.url), 'utf8'),
  ) as {
    StartAt: string
    TimeoutSeconds: number
    States: Record<string, WaitState & ChoiceState & TaskState>
  }

  it('waits until the server deadline before the first resolve', () => {
    expect(definition.StartAt).toBe('WaitForDeadline')
    expect(definition.States.WaitForDeadline).toMatchObject({
      Type: 'Wait',
      TimestampPath: '$.dueAt',
      Next: 'Resolve',
    })
    expect(definition.TimeoutSeconds).toBe(21600)
  })

  it('covers every resolver status and only retries after a check', () => {
    const choice = definition.States.AfterResolve
    const branches = Object.fromEntries(
      (choice?.Choices ?? []).map((rule) => [rule.StringEquals, rule.Next]),
    )
    expect(branches).toEqual({
      SETTLED: 'Done',
      ALREADY_SETTLED: 'Done',
      ORPHANED: 'Done',
      EQUAL_PRICE: 'WaitEqual',
      PROVIDER_HOLD: 'WaitProvider',
      TOO_EARLY: 'WaitForDeadline',
    })
    expect(definition.States.WaitEqual?.Seconds).toBe(5)
    expect(definition.States.WaitProvider?.Seconds).toBe(15)
    expect(definition.States.Resolve?.Resource).toBe('RESOLVE_FUNCTION_ARN')
  })
})
