import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn'
import { workflowExecutionName } from './prediction.js'

export async function startPredictionWorkflow(
  input: { playerId: string; predictionId: string; dueAt: string },
  client = new SFNClient({}),
): Promise<void> {
  const stateMachineArn = process.env.STATE_MACHINE_ARN
  if (!stateMachineArn) throw new Error('STATE_MACHINE_ARN is not set')
  try {
    await client.send(
      new StartExecutionCommand({
        stateMachineArn,
        name: workflowExecutionName(input.predictionId),
        input: JSON.stringify(input),
      }),
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'ExecutionAlreadyExists') return
    throw error
  }
}
