import { DescribeExecutionCommand, ListExecutionsCommand, SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn'
import { workflowExecutionName } from './prediction.js'

export interface WorkflowInput {
  playerId: string
  predictionId: string
  dueAt: string
}

export type ExecutionState = 'MISSING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED'

function stateMachineArn(): string {
  const arn = process.env.STATE_MACHINE_ARN
  if (!arn) throw new Error('STATE_MACHINE_ARN is not set')
  return arn
}

export async function startNamedExecution(name: string, input: WorkflowInput, client = new SFNClient({})): Promise<void> {
  await client.send(new StartExecutionCommand({ stateMachineArn: stateMachineArn(), name, input: JSON.stringify(input) }))
}

/** Start the settlement workflow for a new round. A second start for the same round is a no-op. */
export async function startPredictionWorkflow(input: WorkflowInput, client = new SFNClient({})): Promise<void> {
  try {
    await startNamedExecution(workflowExecutionName(input.predictionId), input, client)
  } catch (error) {
    if (error instanceof Error && error.name === 'ExecutionAlreadyExists') return
    throw error
  }
}

function executionState(status: string | undefined): ExecutionState {
  if (status === 'RUNNING' || status === 'SUCCEEDED' || status === 'TIMED_OUT' || status === 'ABORTED') return status
  return 'FAILED'
}

export async function describeExecution(name: string, client = new SFNClient({})): Promise<ExecutionState> {
  const executionArn = `${stateMachineArn().replace(':stateMachine:', ':execution:')}:${name}`
  try {
    const result = await client.send(new DescribeExecutionCommand({ executionArn }))
    return executionState(result.status)
  } catch (error) {
    if (error instanceof Error && error.name === 'ExecutionDoesNotExist') return 'MISSING'
    throw error
  }
}

export async function listRunningExecutionNames(client = new SFNClient({})): Promise<string[]> {
  const names: string[] = []
  let nextToken: string | undefined
  do {
    const page = await client.send(
      new ListExecutionsCommand({ stateMachineArn: stateMachineArn(), statusFilter: 'RUNNING', maxResults: 1000, nextToken }),
    )
    for (const execution of page.executions ?? []) {
      if (execution.name) names.push(execution.name)
    }
    nextToken = page.nextToken
  } while (nextToken)
  return names
}
