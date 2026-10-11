import { DescribeExecutionCommand, SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn'
import { workflowExecutionName } from '../prediction.js'
import { dynamoPredictionStore, type OverduePrediction, type PredictionStore } from '../predictionStore.js'

const OVERDUE_MS = 2 * 60 * 1000

export type ExecutionState = 'MISSING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED'

export function recoveryExecutionName(predictionId: string, now: Date): string {
  return `${workflowExecutionName(predictionId)}-r${Math.floor(now.getTime() / 60_000)}`
}

export async function handleRecoverStuckPredictions(deps: {
  now?: () => Date
  listOverdue: PredictionStore['listOverdue']
  describe: (name: string) => Promise<ExecutionState>
  start: (name: string, input: { playerId: string; predictionId: string; dueAt: string }) => Promise<void>
}) {
  const now = deps.now ?? (() => new Date())
  const clock = now()
  const before = new Date(clock.getTime() - OVERDUE_MS).toISOString()
  const overdue = await deps.listOverdue(before)
  let started = 0
  for (const prediction of overdue) {
    const base = workflowExecutionName(prediction.predictionId)
    const state = await deps.describe(base)
    if (state === 'RUNNING' || state === 'SUCCEEDED') continue
    const name = state === 'MISSING' ? base : recoveryExecutionName(prediction.predictionId, clock)
    await deps.start(name, {
      playerId: prediction.playerId,
      predictionId: prediction.predictionId,
      dueAt: prediction.dueAt,
    })
    started += 1
  }
  console.log(JSON.stringify({ event: 'prediction.recovery', found: overdue.length, started }))
  return { found: overdue.length, started }
}

function executionState(status: string | undefined): ExecutionState {
  if (status === 'RUNNING') return 'RUNNING'
  if (status === 'SUCCEEDED') return 'SUCCEEDED'
  if (status === 'TIMED_OUT') return 'TIMED_OUT'
  if (status === 'ABORTED') return 'ABORTED'
  return 'FAILED'
}

export function describePredictionExecution(
  name: string,
  stateMachineArn = process.env.STATE_MACHINE_ARN,
  client = new SFNClient({}),
): Promise<ExecutionState> {
  if (!stateMachineArn) throw new Error('STATE_MACHINE_ARN is not set')
  const executionArn = stateMachineArn.replace(':stateMachine:', ':execution:') + `:${name}`
  return client
    .send(new DescribeExecutionCommand({ executionArn }))
    .then((result) => executionState(result.status))
    .catch((error: unknown) => {
      if (error instanceof Error && error.name === 'ExecutionDoesNotExist') return 'MISSING'
      throw error
    })
}

export async function startNamedExecution(
  name: string,
  input: { playerId: string; predictionId: string; dueAt: string },
  stateMachineArn = process.env.STATE_MACHINE_ARN,
  client = new SFNClient({}),
): Promise<void> {
  if (!stateMachineArn) throw new Error('STATE_MACHINE_ARN is not set')
  await client.send(
    new StartExecutionCommand({
      stateMachineArn,
      name,
      input: JSON.stringify(input),
    }),
  )
}

export const handler = async () => {
  const store = dynamoPredictionStore()
  return handleRecoverStuckPredictions({
    listOverdue: (before) => store.listOverdue(before),
    describe: (name) => describePredictionExecution(name),
    start: (name, input) => startNamedExecution(name, input),
  })
}

export type { OverduePrediction }
