import { describe, expect, it } from 'vitest'
import { playerProblem } from '../components/PlayerNotice'

const ok = { configured: true, storageBlocked: false, pending: false, errored: false, rejected: false, hasPlayer: true }

describe('playerProblem', () => {
  it('reports setup problems before anything else', () => {
    expect(playerProblem({ ...ok, configured: false, pending: true })).toBe('unconfigured')
    expect(playerProblem({ ...ok, storageBlocked: true })).toBe('storage-blocked')
  })

  it('separates first load, a rejected token, an unreachable server, and a stale snapshot', () => {
    expect(playerProblem({ ...ok, pending: true, hasPlayer: false })).toBe('restoring')
    expect(playerProblem({ ...ok, errored: true, rejected: true })).toBe('rejected')
    expect(playerProblem({ ...ok, errored: true, hasPlayer: false })).toBe('unreachable')
    expect(playerProblem({ ...ok, errored: true })).toBe('stale')
    expect(playerProblem(ok)).toBeNull()
  })
})
