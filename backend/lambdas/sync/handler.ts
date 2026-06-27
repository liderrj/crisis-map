import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { docClient, TABLES, putItem, updateItem } from '../../shared/db.js';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';
import { encodeGeohash, geohashNeighbours, haversineMeters } from '../../shared/geo.js';
import { isValidIncidentType, isValidSeverity, categoryForType } from '../../shared/constants.js';
import {
  EXPIRATION_WINDOW_SECONDS,
  MAX_DESCRIPTION_LENGTH,
  DUPLICATE_RADIUS_METERS,
  type Incident,
  type IncidentCreateInput,
  type ConfirmationAction,
} from '../../shared/types.js';
import { extractDeviceContext, jsonResponse, errorResponse } from '../../shared/headers.js';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

interface SyncOperation {
  op: 'create_incident' | 'confirm';
  payload: Record<string, unknown>;
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const device = extractDeviceContext(event.headers as Record<string, string | undefined>);
  if (!device) return errorResponse(400, 'deviceId header is required');

  let body: { operations?: SyncOperation[] };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }

  const operations = body.operations ?? [];
  const results = [];

  for (const op of operations) {
    if (op.op === 'create_incident') {
      const r = await applyCreate(op.payload as unknown as IncidentCreateInput, device);
      results.push({ op: 'create_incident', ...r });
    } else if (op.op === 'confirm') {
      const r = await applyConfirm(op.payload as { incidentId: string; action: string }, device);
      results.push({ op: 'confirm', ...r });
    } else {
      results.push({ op: op.op, status: 'error', message: 'Unknown operation' });
    }
  }

  return jsonResponse(200, { results });
};

async function applyCreate(
  input: IncidentCreateInput,
  device: { deviceId: string; alias?: string },
): Promise<Record<string, unknown>> {
  if (!input.type || !isValidIncidentType(input.type)) return { status: 'error', message: 'Invalid type' };
  if (!input.severity || !isValidSeverity(input.severity)) return { status: 'error', message: 'Invalid severity' };
  if (!input.location) return { status: 'error', message: 'Invalid location' };

  const geohash = encodeGeohash(input.location.lat, input.location.lng);
  const duplicate = await findDuplicate(input.type, geohash, input.location.lat, input.location.lng);
  if (duplicate) {
    return { status: 'duplicate', duplicateOf: duplicate.incidentId };
  }

  const now = Math.floor(Date.now() / 1000);
  const incidentId = randomUUID();
  const incident: Incident = {
    incidentId,
    type: input.type,
    category: categoryForType(input.type),
    severity: input.severity,
    status: 'active',
    location: input.location,
    geohash,
    description: input.description?.slice(0, MAX_DESCRIPTION_LENGTH),
    createdAt: now,
    updatedAt: now,
    expiresAt: now + EXPIRATION_WINDOW_SECONDS,
    creatorAlias: device.alias,
    creatorDeviceId: device.deviceId,
    confirmations: 1,
    negativeVotes: 0,
    imageCount: input.imageCount ?? 0,
  };

  await putItem(TABLES.incidents, incident as unknown as Record<string, unknown>);
  return { status: 'created', incidentId };
}

async function applyConfirm(
  payload: { incidentId: string; action: string },
  device: { deviceId: string; alias?: string },
): Promise<Record<string, unknown>> {
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
  let update = 'SET confirmations = confirmations + :one, updatedAt = :now, expiresAt = :exp';
  const values: Record<string, unknown> = { ':one': 1, ':now': now, ':exp': expiresAt };
  if (action === 'worsened') {
    update = 'SET negativeVotes = negativeVotes + :one, updatedAt = :now';
    const worsenedValues: Record<string, unknown> = { ':one': 1, ':now': now };
    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.incidents,
        Key: { incidentId: payload.incidentId },
        UpdateExpression: update,
        ExpressionAttributeValues: worsenedValues,
      }),
    );
    return { status: 'applied', incidentId: payload.incidentId };
  }

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

async function findDuplicate(type: string, geohash: string, lat: number, lng: number): Promise<Incident | null> {
  const cells = geohashNeighbours(geohash);
  for (const cell of cells) {
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
    if (!res.Items) continue;
    for (const item of res.Items as Incident[]) {
      if (haversineMeters(lat, lng, item.location.lat, item.location.lng) <= DUPLICATE_RADIUS_METERS) return item;
    }
  }
  return null;
}
