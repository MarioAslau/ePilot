import { StatusNotice } from './StatusNotice'

/** Why the player can't be shown normally. At most one applies at a time. */
export type PlayerProblem = 'unconfigured' | 'storage-blocked' | 'restoring' | 'rejected' | 'unreachable' | 'stale'

export function playerProblem(input: {
  configured: boolean
  storageBlocked: boolean
  pending: boolean
  errored: boolean
  /** The server answered 401 for the saved token. */
  rejected: boolean
  /** A confirmed snapshot is on screen. */
  hasPlayer: boolean
}): PlayerProblem | null {
  if (!input.configured) return 'unconfigured'
  if (input.storageBlocked) return 'storage-blocked'
  if (input.pending && !input.hasPlayer) return 'restoring'
  if (!input.errored) return null
  if (input.rejected) return 'rejected'
  return input.hasPlayer ? 'stale' : 'unreachable'
}

export function PlayerNotice({
  problem,
  onRetry,
  onStartOver,
}: {
  problem: PlayerProblem
  onRetry: () => void
  onStartOver: () => void
}) {
  const retry = { label: 'Retry', onClick: onRetry }
  switch (problem) {
    case 'unconfigured':
      return (
        <StatusNotice
          kind="error"
          message="API address is not configured."
          detail="Set VITE_API_BASE_URL to the deployed API Gateway URL, then rebuild."
        />
      )
    case 'storage-blocked':
      return <StatusNotice kind="error" message="This browser could not save your player." />
    case 'restoring':
      return <StatusNotice kind="info" message="Restoring your player…" />
    case 'rejected':
      return (
        <StatusNotice
          kind="error"
          message="This browser’s saved player was rejected."
          detail="The saved token does not match the server. Starting again creates a new player at score 0."
          action={{ label: 'Start a new player', onClick: onStartOver }}
        />
      )
    case 'unreachable':
      return <StatusNotice kind="error" message="Could not reach the server." detail="Your saved player is still in this browser." action={retry} />
    case 'stale':
      return <StatusNotice kind="warn" message="Could not refresh your player." detail="Showing the last confirmed score." action={retry} />
  }
}
