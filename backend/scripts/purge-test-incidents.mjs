#!/usr/bin/env node
/**
 * Reset the platform to "distribution-ready" state by deleting every
 * non-seed incident and its associated data, leaving only the seed
 * incidents (hospitals, refugios, aeropuerto, Starlink, etc).
 *
 * Deletes:
 *   • Incidents where incidentId does NOT start with "seed-"
 *     AND creatorDeviceId is not "system-seed".
 *   • All Confirmations rows tied to those incidentIds.
 *   • All S3 image objects under {incidentId}/ for those incidents.
 *
 * Preserves:
 *   • Devices table (anonymous deviceIds + aliases).
 *   • Self-hosted tiles bucket (read from the seed-tiles pipeline).
 *   • Seed incidents and any confirmations against them.
 *
 * Usage:
 *   # dry run (default): shows what would be deleted, no writes
 *   node backend/scripts/purge-test-incidents.mjs
 *
 *   # actually delete
 *   node backend/scripts/purge-test-incidents.mjs --yes
 *
 *   # override defaults via env vars
 *   INCIDENTS_TABLE=Incidents CONFIRMATIONS_TABLE=Confirmations \
 *     IMAGE_BUCKET=crisismapstack-imagestorageimagebucket-X --yes node backend/scripts/purge-test-incidents.mjs
 *
 * Requires AWS credentials in the environment (or AWS_PROFILE) with
 * permission to Scan/Query/Delete on the DynamoDB tables and
 * ListObjectsV2/PutObject on the S3 image bucket.
 */

import {
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  BatchWriteCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

const INCIDENTS_TABLE = process.env.INCIDENTS_TABLE ?? 'Incidents';
const CONFIRMATIONS_TABLE = process.env.CONFIRMATIONS_TABLE ?? 'Confirmations';
const IMAGE_BUCKET = process.env.IMAGE_BUCKET;
const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';
const SEED_ID_PREFIX = 'seed-';
const SEED_DEVICE_ID = 'system-seed';

const argv = process.argv.slice(2);
const wantExecute = argv.includes('--yes');
const isDryRun = !wantExecute;
const verbose = argv.includes('--verbose') || argv.includes('-v');

// Touch process.env before constructing any clients so AWS_REGION is read.
process.env.AWS_REGION = AWS_REGION;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({ region: AWS_REGION });

/**
 * @param {{ execute?: boolean }} [opts]
 */
function logPlan(label, count, opts = {}) {
  if (opts.execute || isDryRun) {
    console.log(`${label}: ${count}`);
  }
}

/**
 * @returns {Promise<{ ok: boolean, msg?: string }>}
 */
async function askForConfirmation() {
  if (wantExecute) return { ok: true };
  console.log('\nThis was a DRY RUN. Re-run with --yes to apply.');
  return { ok: false, msg: 'dry run' };
}

async function scanAll(tableName, projectionExpression) {
  const items = [];
  let lastKey;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastKey,
      ...(projectionExpression ? { ProjectionExpression: projectionExpression } : {}),
    }));
    if (res.Items) items.push(...res.Items);
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

function isSeedIncident(item) {
  if (typeof item.incidentId !== 'string') return false;
  if (item.incidentId.startsWith(SEED_ID_PREFIX)) return true;
  if (item.creatorDeviceId === SEED_DEVICE_ID) return true;
  return false;
}

async function listAllImageKeys(bucket, incidentId) {
  const keys = [];
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `${incidentId}/`,
      ContinuationToken: token,
    }));
    for (const obj of res.Contents ?? []) {
      if (typeof obj.Key === 'string') keys.push(obj.Key);
    }
    token = res.NextContinuationToken;
  } while (token);
  return keys;
}

async function deleteImageKeys(bucket, keys) {
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    await s3.send(new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
    }));
  }
}

async function deleteAllConfirmations(incidentIds) {
  if (incidentIds.length === 0) return;
  const writer = (async () => {
    for (const incidentId of incidentIds) {
      let last;
      const items = [];
      do {
        const res = await ddb.send(new QueryCommand({
          TableName: CONFIRMATIONS_TABLE,
          KeyConditionExpression: 'incidentId = :id',
          ExpressionAttributeValues: { ':id': incidentId },
          ProjectionExpression: 'incidentId, #d',
          ExpressionAttributeNames: { '#d': 'deviceId' },
          ExclusiveStartKey: last,
        }));
        if (res.Items) items.push(...res.Items);
        last = res.LastEvaluatedKey;
      } while (last);

      if (items.length === 0) continue;

      for (let i = 0; i < items.length; i += 25) {
        const chunk = items.slice(i, i + 25);
        await ddb.send(new BatchWriteCommand({
          RequestItems: {
            [CONFIRMATIONS_TABLE]: chunk.map((it) => ({
              DeleteRequest: { Key: { incidentId: it.incidentId, deviceId: it.deviceId } },
            })),
          },
        }));
      }
    }
  })();
  await writer;
}

async function deleteIncidents(incidentIds) {
  const CONCURRENCY = 25;
  let i = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (i < incidentIds.length) {
        const idx = i++;
        if (idx >= incidentIds.length) return;
        const id = incidentIds[idx];
        await ddb.send(new DeleteCommand({
          TableName: INCIDENTS_TABLE,
          Key: { incidentId: id },
        }));
      }
    }),
  );
}

async function main() {
  console.log('=== CrisisMap purge-test-incidents ===');
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log(`Incidents table:    ${INCIDENTS_TABLE}`);
  console.log(`Confirmations table: ${CONFIRMATIONS_TABLE}`);
  console.log(`Image bucket:       ${IMAGE_BUCKET ?? '(not set — image S3 cleanup will be skipped)'}`);
  console.log(`AWS region:         ${AWS_REGION}`);
  console.log(`Keep: incidentId starts with "${SEED_ID_PREFIX}" OR creatorDeviceId = "${SEED_DEVICE_ID}"`);

  console.log('\nScanning Incidents table...');
  const allIncidents = await scanAll(INCIDENTS_TABLE, 'incidentId, creatorDeviceId, imageCount');
  console.log(`Total incidents in table: ${allIncidents.length}`);

  const seedIncidents = allIncidents.filter(isSeedIncident);
  const victims = allIncidents.filter((it) => !isSeedIncident(it));

  console.log(`  • Will keep:   ${seedIncidents.length} (seed)`);
  console.log(`  • Will delete: ${victims.length} (user reports / stress tests)`);

  if (victims.length === 0) {
    console.log('\nNothing to do.');
    return;
  }

  if (victims.length <= 10 || verbose) {
    console.log('\nIncident IDs marked for removal:');
    for (const v of victims) console.log(`  - ${v.incidentId}`);
  }

  // Images
  let totalImages = 0;
  const imageKeysByIncident = new Map();
  if (IMAGE_BUCKET) {
    console.log('\nListing S3 images for affected incidents...');
    for (const v of victims) {
      const keys = await listAllImageKeys(IMAGE_BUCKET, v.incidentId);
      imageKeysByIncident.set(v.incidentId, keys);
      totalImages += keys.length;
    }
    console.log(`Total S3 image objects to delete: ${totalImages}`);
  } else {
    console.log('\nIMAGE_BUCKET not set — skipping S3 cleanup (add the env var to also delete images).');
  }

  // Confirmations
  console.log('\nCounting Confirmations for affected incidents...');
  let confirmationCount = 0;
  for (const v of victims) {
    let last;
    do {
      const res = await ddb.send(new QueryCommand({
        TableName: CONFIRMATIONS_TABLE,
        KeyConditionExpression: 'incidentId = :id',
        ExpressionAttributeValues: { ':id': v.incidentId },
        Select: 'COUNT',
        ExclusiveStartKey: last,
      }));
      confirmationCount += res.Count ?? 0;
      last = res.LastEvaluatedKey;
    } while (last);
  }
  console.log(`Total Confirmations rows to delete: ${confirmationCount}`);

  const confirm = await askForConfirmation();
  if (!confirm.ok) return;

  // 1) images
  if (IMAGE_BUCKET && totalImages > 0) {
    console.log('\nDeleting S3 images...');
    const allKeys = [];
    for (const keys of imageKeysByIncident.values()) allKeys.push(...keys);
    await deleteImageKeys(IMAGE_BUCKET, allKeys);
    console.log(`  ${allKeys.length} images deleted from s3://${IMAGE_BUCKET}/`);
  }

  // 2) confirmations
  if (confirmationCount > 0) {
    console.log('\nDeleting Confirmations rows...');
    await deleteAllConfirmations(victims.map((v) => v.incidentId));
    console.log(`  ${confirmationCount} confirmations deleted`);
  }

  // 3) incidents
  console.log('\nDeleting Incidents rows...');
  await deleteIncidents(victims.map((v) => v.incidentId));
  console.log(`  ${victims.length} incidents deleted`);

  console.log('\nDone. Seed incidents and their confirmations were preserved.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
