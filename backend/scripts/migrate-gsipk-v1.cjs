// One-off migration: add gsiPk='incident' to all existing incidents.
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }));
const tableName = process.argv[2];

if (!tableName) {
  console.error('Usage: node migrate-gsipk.js <IncidentsTableName>');
  process.exit(1);
}

(async () => {
  let lastKey;
  let updated = 0;
  let skipped = 0;
  do {
    const res = await client.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastKey,
      ProjectionExpression: 'incidentId, gsiPk',
    }));
    for (const item of (res.Items || [])) {
      if (item.gsiPk) { skipped++; continue; }
      await client.send(new UpdateCommand({
        TableName: tableName,
        Key: { incidentId: item.incidentId },
        UpdateExpression: 'SET gsiPk = :pk',
        ExpressionAttributeValues: { ':pk': 'incident' },
      }));
      updated++;
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  console.log(`Updated: ${updated}, Skipped (already had gsiPk): ${skipped}`);
})().catch(console.error);