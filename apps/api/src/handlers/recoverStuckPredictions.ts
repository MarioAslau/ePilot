import { DescribeExecutionCommand, ListExecutionsCommand, SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn'
import { workflowExecutionName } from '../prediction.js'
import { dynamoPredictionStore, type OverduePrediction, type PredictionStore } from '../predictionStore.js'

const OVERDUE_MS = 2 * 60 * 1000

export type ExecutionState = 'MISSING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED'

export function recoveryExecutionName(predictionId: string, now: Date): string {
  return `${workflowExecutionName(predictionId)}-r${Math.floor(now.getTime() / 60_000)}`
}

function logRecovery(fields: {
  predictionId: string
  playerId: string
  state: ExecutionState
  action: 'skip' | 'start'
  executionName: string
}) {
  console.log(JSON.stringify({ event: 'prediction.recovery', ...fields }))
}

export async function handleRecoverStuckPredictions(deps: {
  now?: () => Date
  listOverdue: PredictionStore['listOverdue']
  describe: (name: string) => Promise<ExecutionState>
  start: (name: string, input: { playerId: string; predictionId: string; dueAt: string }) => Promise<void>
  /** Names of executions that are running now. A running `prediction-<id>-r…` must not be started again. */
  running?: string[]
}) {
  const now = deps.now ?? (() => new Date())
  const clock = now()
  const before = new Date(clock.getTime() - OVERDUE_MS).toISOString()
  const overdue = await deps.listOverdue(before)
  const running = deps.running ?? []
  let started = 0
  for (const prediction of overdue) {
    const base = workflowExecutionName(prediction.predictionId)
    const state = await deps.describe(base)
    const runningName = running.find((name) => name === base || name.startsWith(`${base}-`))
    if (state === 'RUNNING' || state === 'SUCCEEDED' || runningName) {
      logRecovery({
        predictionId: prediction.predictionId,
        playerId: prediction.playerId,
        state,
        action: 'skip',
        executionName: runningName ?? base,
      })
      continue
    }
    const name = state === 'MISSING' ? base : recoveryExecutionName(prediction.predictionId, clock)
    await deps.start(name, {
      playerId: prediction.playerId,
      predictionId: prediction.predictionId,
      dueAt: prediction.dueAt,
    })
    started += 1
    logRecovery({
      predictionId: prediction.predictionId,
      playerId: prediction.playerId,
      state,
      action: 'start',
      executionName: name,
    })
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

export async function listRunningExecutionNames(
  stateMachineArn = process.env.STATE_MACHINE_ARN,
  client = new SFNClient({}),
): Promise<string[]> {
  if (!stateMachineArn) throw new Error('STATE_MACHINE_ARN is not set')
  const names: string[] = []
  let nextToken: string | undefined
  do {
    const page = await client.send(
      new ListExecutionsCommand({
        stateMachineArn,
        statusFilter: 'RUNNING',
        maxResults: 1000,
        nextToken,
      }),
    )
    for (const execution of page.executions ?? []) {
      if (execution.name) names.push(execution.name)
    }
    nextToken = page.nextToken
  } while (nextToken)
  return names
}

export const handler = async () => {
  const store = dynamoPredictionStore()
  return handleRecoverStuckPredictions({
    listOverdue: (before) => store.listOverdue(before),
    describe: (name) => describePredictionExecution(name),
    start: (name, input) => startNamedExecution(name, input),
    running: await listRunningExecutionNames(),
  })
}

export type { OverduePrediction }
