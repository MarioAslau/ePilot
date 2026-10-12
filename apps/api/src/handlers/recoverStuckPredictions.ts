import { log } from '../log.js'
import { workflowExecutionName } from '../prediction.js'
import type { OverduePrediction, PredictionStore } from '../predictionStore.js'
import { productionStores } from '../stores.js'
import {
  describeExecution,
  listRunningExecutionNames,
  startNamedExecution,
  type ExecutionState,
  type WorkflowInput,
} from '../workflowClient.js'

const OVERDUE_MS = 2 * 60 * 1000

export type { ExecutionState, OverduePrediction }

export function recoveryExecutionName(predictionId: string, now: Date): string {
  return `${workflowExecutionName(predictionId)}-r${Math.floor(now.getTime() / 60_000)}`
}

export async function handleRecoverStuckPredictions(deps: {
  now?: () => Date
  listOverdue: PredictionStore['listOverdue']
  describe: (name: string) => Promise<ExecutionState>
  start: (name: string, input: WorkflowInput) => Promise<void>
  /** Names of executions that are running now. A running `prediction-<id>-r…` must not be started again. */
  running?: string[]
}) {
  const clock = (deps.now ?? (() => new Date()))()
  const before = new Date(clock.getTime() - OVERDUE_MS).toISOString()
  const overdue = await deps.listOverdue(before)
  const running = deps.running ?? []
  let started = 0
  for (const prediction of overdue) {
    const base = workflowExecutionName(prediction.predictionId)
    const state = await deps.describe(base)
    const runningName = running.find((name) => name === base || name.startsWith(`${base}-`))
    const skip = state === 'RUNNING' || state === 'SUCCEEDED' || runningName !== undefined
    const executionName = skip
      ? (runningName ?? base)
      : state === 'MISSING' ? base : recoveryExecutionName(prediction.predictionId, clock)
    if (!skip) {
      const { playerId, predictionId, dueAt } = prediction
      await deps.start(executionName, { playerId, predictionId, dueAt })
      started += 1
    }
    log('prediction.recovery', {
      predictionId: prediction.predictionId,
      playerId: prediction.playerId,
      state,
      action: skip ? 'skip' : 'start',
      executionName,
    })
  }
  log('prediction.recovery', { found: overdue.length, started })
  return { found: overdue.length, started }
}

export const handler = async () =>
  handleRecoverStuckPredictions({
    listOverdue: (before) => productionStores().predictions.listOverdue(before),
    describe: (name) => describeExecution(name),
    start: (name, input) => startNamedExecution(name, input),
    running: await listRunningExecutionNames(),
  })
