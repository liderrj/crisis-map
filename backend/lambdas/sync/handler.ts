import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { docClient, TABLES, putItem, updateItem } from '../../shared/db.js';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createHash } from 'node:crypto';
import { encodeGeohash, geohashNeighbours, haversineMeters } from '../../shared/geo.js';
import { isValidIncidentType, isValidSeverity, categoryForType } from '../../shared/constants.js';
import {
  EXPIRATION_WINDOW_SECONDS,
  MAX_DESCRIPTION_LENGTH,
  MAX_IMAGE_COUNT,
  DUPLICATE_RADIUS_METERS,
  isValidIncidentId,
  type Incident,
  type IncidentCreateInput,
  type ConfirmationAction,
} from '../../shared/types.js';
import { extractDeviceContext, jsonResponse, errorResponse, sanitize } from '../../shared/headers.js';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

interface SyncOperation {
  op: 'create_incident' | 'confirm';
  payload: Record<string, unknown>;
}

const MAX_OPERATIONS_PER_REQUEST = 100;
const SYNC_CONCURRENCY = 10;

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const device = extractDeviceContext(event.headers as Record<string, string | undefined>);
    if (!device) return errorResponse(400, 'deviceId header is required');

    let body: { operations?: SyncOperation[] };
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return errorResponse(400, 'Invalid JSON body');
    }

    const operations = Array.isArray(body.operations) ? body.operations : [];
    if (operations.length > MAX_OPERATIONS_PER_REQUEST) {
      return errorResponse(400, `Max ${MAX_OPERATIONS_PER_REQUEST} operations per request`);
    }

    const results = await runBatch(operations, async (op) => {
      if (op?.op === 'create_incident') {
        const r = await applyCreate(op.payload as unknown as IncidentCreateInput, device);
        return { op: 'create_incident', ...r };
      }
      if (op?.op === 'confirm') {
        const r = await applyConfirm(op.payload as { incidentId: string; action: string }, device);
        return { op: 'confirm', ...r };
      }
      return { op: op?.op ?? 'unknown', status: 'error', message: 'Unknown operation' };
    }, SYNC_CONCURRENCY);

    return jsonResponse(200, { results });
  } catch (err) {
    console.error('Sync handler error:', err);
    return errorResponse(500, 'Internal error');
  }
};

async function applyCreate(
  input: IncidentCreateInput,
  device: { deviceId: string; alias?: string },
): Promise<Record<string, unknown>> {
  if (!input?.type || !isValidIncidentType(input.type)) return { status: 'error', message: 'Invalid type' };
  if (!input?.severity || !isValidSeverity(input.severity)) return { status: 'error', message: 'Invalid severity' };
  if (
    !input?.location ||
    typeof input.location.lat !== 'number' ||
    typeof input.location.lng !== 'number' ||
    input.location.lat < -90 ||
    input.location.lat > 90 ||
    input.location.lng < -180 ||
    input.location.lng > 180
  ) {
    return { status: 'error', message: 'Invalid location' };
  }
  const imageCount = Math.max(0, Math.min(MAX_IMAGE_COUNT, input.imageCount ?? 0));

  const geohash = encodeGeohash(input.location.lat, input.location.lng);
  const duplicate = await findDuplicate(input.type, geohash, input.location.lat, input.location.lng);
  if (duplicate) {
    return { status: 'duplicate', duplicateOf: duplicate.incidentId };
  }

  const now = Math.floor(Date.now() / 1000);
  // Deterministic ID from type + geohash(6) (~600m cell) so concurrent
  // creates of the same report write to the same item — the second
  // putItem is an idempotent no-op, preventing duplicates.
  const incidentId = createHash('sha256')
    .update(`${input.type}:${geohash.slice(0, 6)}`)
    .digest('hex')
    .slice(0, 36);
  const incident: Incident = {
    incidentId,
    type: input.type,
    category: categoryForType(input.type),
    severity: input.severity,
    status: 'active',
    location: input.location,
    geohash,
    description: input.description ? sanitize(input.description, MAX_DESCRIPTION_LENGTH) : undefined,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + EXPIRATION_WINDOW_SECONDS,
    creatorAlias: device.alias,
    creatorDeviceId: device.deviceId,
    confirmations: 1,
    negativeVotes: 0,
    imageCount,
    gsiPkV2: geohash[0],
  };

  await putItem(TABLES.incidents, incident as unknown as Record<string, unknown>);
  return { status: 'created', incidentId };
}

async function applyConfirm(
  payload: { incidentId: string; action: string },
  device: { deviceId: string; alias?: string },
): Promise<Record<string, unknown>> {
  if (!payload?.incidentId || !isValidIncidentId(payload.incidentId)) {
    return { status: 'error', message: 'Invalid incidentId' };
  }
  const action = payload.action as ConfirmationAction;
  if (!['confirm', 'improved', 'worsened', 'no_longer_exists'].includes(action)) {
    return { status: 'error', message: 'Invalid action' };
  }

  const now = Math.floor(Date.now() / 1000);
  const created = await putItem(
    TABLES.confirmations,
    { incidentId: payload.incidentId, deviceId: device.deviceId, action, createdAt: now },
    'attribute_not_exists(incidentId)',
  );
  if (!created) return { status: 'conflict', message: 'already verified by this device' };

  if (action === 'no_longer_exists') {
    await updateItem(TABLES.incidents, { incidentId: payload.incidentId }, 'SET #s = :r, updatedAt = :now', {
      ':r': 'resolved',
      ':now': now,
    });
    return { status: 'applied', incidentId: payload.incidentId, incidentStatus: 'resolved' };
  }

  const expiresAt = now + EXPIRATION_WINDOW_SECONDS;
  const isWorsened = action === 'worsened';
  const update = isWorsened
    ? 'SET negativeVotes = negativeVotes + :one, updatedAt = :now'
    : 'SET confirmations = confirmations + :one, updatedAt = :now, expiresAt = :exp';
  const values: Record<string, unknown> = isWorsened
    ? { ':one': 1, ':now': now }
    : { ':one': 1, ':now': now, ':exp': expiresAt };

  await docClient.send(
    new UpdateCommand({
      TableName: TABLES.incidents,
      Key: { incidentId: payload.incidentId },
      UpdateExpression: update,
      ExpressionAttributeValues: values,
    }),
  );

  return { status: 'applied', incidentId: payload.incidentId };
}

async function runBatch<T>(
  items: T[],
  fn: (item: T) => Promise<Record<string, unknown>>,
  concurrency: number,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map(fn));
    for (const r of batchResults) {
      if (r.status === 'fulfilled') {
        results.push(r.value);
      } else {
        console.error('Sync op error:', r.reason);
        results.push({ status: 'error', message: 'Operation failed' });
      }
    }
  }
  return results;
}

async function findDuplicate(type: string, geohash: string, lat: number, lng: number): Promise<Incident | null> {
  const cells = geohashNeighbours(geohash);
  const results = await Promise.all(
    cells.map(async (cell) => {
      const res = await docClient.send(
        new QueryCommand({
          TableName: TABLES.incidents,
          IndexName: 'type-geohash-index',
          KeyConditionExpression: '#t = :t AND begins_with(geohash, :gh)',
          FilterExpression: '#s = :status',
          ExpressionAttributeNames: { '#t': 'type', '#s': 'status' },
          ExpressionAttributeValues: { ':t': type, ':gh': cell, ':status': 'active' },
        }),
      );
      return (res.Items ?? []) as Incident[];
    }),
  );
  for (const items of results) {
    for (const item of items) {
      if (haversineMeters(lat, lng, item.location.lat, item.location.lng) <= DUPLICATE_RADIUS_METERS) return item;
    }
  }
  return null;
}
