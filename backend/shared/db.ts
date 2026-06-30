import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

export const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLES = {
  incidents: process.env.INCIDENTS_TABLE ?? 'Incidents',
  confirmations: process.env.CONFIRMATIONS_TABLE ?? 'Confirmations',
  devices: process.env.DEVICES_TABLE ?? 'Devices',
  oauthClients: process.env.OAUTH_CLIENTS_TABLE ?? 'OAuthClients',
  externalActions: process.env.EXTERNAL_ACTIONS_TABLE ?? 'ExternalActions',
  rateLimits: process.env.RATE_LIMITS_TABLE ?? 'RateLimits',
};

export async function getItem<T = Record<string, unknown>>(
  tableName: string,
  key: Record<string, unknown>,
): Promise<T | undefined> {
  const res = await docClient.send(new GetCommand({ TableName: tableName, Key: key }));
  return res.Item as T | undefined;
}

export async function putItem(
  tableName: string,
  item: Record<string, unknown>,
  condition?: string,
): Promise<boolean> {
  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ConditionExpression: condition,
      }),
    );
    return true;
  } catch (err) {
    if ((err as Error).name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

export async function updateItem(
  tableName: string,
  key: Record<string, unknown>,
  updateExpression: string,
  values: Record<string, unknown>,
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: values,
    }),
  );
}
