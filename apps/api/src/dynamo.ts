import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

export function documentClient(): DynamoDBDocumentClient {
  const endpoint = process.env.AWS_ENDPOINT_URL_DYNAMODB
  return DynamoDBDocumentClient.from(new DynamoDBClient(endpoint ? { endpoint } : {}))
}
