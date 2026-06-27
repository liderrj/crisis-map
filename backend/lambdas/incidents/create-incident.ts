import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { docClient, TABLES, putItem } from '../../shared/db.js';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { encodeGeohash, geohashNeighbours, haversineMeters } from '../../shared/geo.js';
import { isValidIncidentType, isValidSeverity, categoryForType } from '../../shared/constants.js';
import {
  EXPIRATION_WINDOW_SECONDS,
  MAX_DESCRIPTION_LENGTH,
  MAX_IMAGE_COUNT,
  DUPLICATE_RADIUS_METERS,
  type Incident,
  type IncidentCreateInput,
} from '../../shared/types.js';
import { extractDeviceContext, jsonResponse, errorResponse } from '../../shared/headers.js';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const device = extractDeviceContext(event.headers as Record<string, string | undefined>);
  if (!device) return errorResponse(400, 'deviceId header is required');

  let input: Partial<IncidentCreateInput>;
  try {
    input = JSON.parse(event.body ?? '{}');
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }

  if (!input.type || !isValidIncidentType(input.type)) {
    return errorResponse(400, 'Invalid or missing type');
  }
  if (!input.severity || !isValidSeverity(input.severity)) {
    return errorResponse(400, 'Invalid or missing severity');
  }
  if (!input.location || typeof input.location.lat !== 'number' || typeof input.location.lng !== 'number') {
    return errorResponse(400, 'Invalid or missing location');
  }
  if (input.location.lat < -90 || input.location.lat > 90 || input.location.lng < -180 || input.location.lng > 180) {
    return errorResponse(400, 'Location out of range');
  }
  if (typeof input.imageCount !== 'number' || input.imageCount < 0 || input.imageCount > MAX_IMAGE_COUNT) {
    input.imageCount = 0;
  }

  const geohash = encodeGeohash(input.location.lat, input.location.lng);
  const now = Math.floor(Date.now() / 1000);

  const duplicate = await findDuplicate(input.type, geohash, input.location.lat, input.location.lng);
  if (duplicate) {
    return jsonResponse(200, {
      duplicateOf: duplicate.incidentId,
      message: 'A similar incident exists nearby.',
    });
  }

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
    imageCount: input.imageCount,
  };

  await putItem(TABLES.incidents, incident as unknown as Record<string, unknown>);

  await docClient.send({
    TableName: TABLES.devices,
    Item: { deviceId: device.deviceId, alias: device.alias ?? '', createdAt: now },
  } as unknown as Parameters<typeof docClient.send>[0]);

  return jsonResponse(201, {
    incidentId,
    status: 'active',
    confirmations: 1,
    negativeVotes: 0,
    createdAt: now,
    expiresAt: incident.expiresAt,
  });
};

async function findDuplicate(
  type: string,
  geohash: string,
  lat: number,
  lng: number,
): Promise<Incident | null> {
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
      const dist = haversineMeters(lat, lng, item.location.lat, item.location.lng);
      if (dist <= DUPLICATE_RADIUS_METERS) return item;
    }
  }
  return null;
}
