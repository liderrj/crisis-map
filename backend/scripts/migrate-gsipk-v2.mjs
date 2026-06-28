import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const TABLE = process.env.INCIDENTS_TABLE ?? 'Incidents';
const CONCURRENCY = 25;

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

let processed = 0;
let updated = 0;
let skipped = 0;
let lastKey = undefined;

console.log(`Backfilling gsiPkV2 on table: ${TABLE}`);

do {
  const { Items, LastEvaluatedKey } = await client.send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: 'attribute_not_exists(gsiPkV2)',
      ProjectionExpression: 'incidentId, geohash',
      Limit: 5000,
      ExclusiveStartKey: lastKey,
    }),
  );

  if (!Items || Items.length === 0) {
    lastKey = LastEvaluatedKey;
    continue;
  }

  const batches = [];
  for (let i = 0; i < Items.length; i += CONCURRENCY) {
    batches.push(Items.slice(i, i + CONCURRENCY));
  }

  for (const batch of batches) {
    await Promise.all(
      batch.map(async (item) => {
        if (!item.geohash || !item.geohash[0]) {
          skipped++;
          return;
        }
        await client.send(
          new UpdateCommand({
            TableName: TABLE,
            Key: { incidentId: item.incidentId },
            UpdateExpression: 'SET gsiPkV2 = :val',
            ExpressionAttributeValues: { ':val': item.geohash[0] },
          }),
        );
        updated++;
      }),
    );
  }

  processed += Items.length;
  console.log(`  Processed: ${processed}, Updated: ${updated}, Skipped: ${skipped}`);

  lastKey = LastEvaluatedKey;
} while (lastKey);

console.log(`Done. Total processed: ${processed}, Updated: ${updated}, Skipped: ${skipped}`);
