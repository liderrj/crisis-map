import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { docClient, TABLES } from '../../shared/db.js';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { parseBbox, bboxToGeohashCells, encodeGeohash } from '../../shared/geo.js';
import { categoryForType } from '../../shared/constants.js';
import { computeConfidence } from '../../shared/types.js';
import type { Incident } from '../../shared/types.js';
import { jsonResponse, errorResponse } from '../../shared/headers.js';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const qs = event.queryStringParameters ?? {};
  const bbox = qs.bbox;

  if (!bbox) {
    return errorResponse(400, 'bbox query parameter is required');
  }

  const bounds = parseBbox(bbox);
  if (!bounds) {
    return errorResponse(400, 'Invalid bbox format. Expected minLng,minLat,maxLng,maxLat');
  }

  const cells = bboxToGeohashCells(bounds);
  const now = Math.floor(Date.now() / 1000);
  const limit = Math.min(parseInt(qs.limit ?? '100', 10), 200);

  const typeFilter = qs.type ? qs.type.split(',') : undefined;
  const confirmedOnly = qs.confirmedOnly === 'true';
  const includeHidden = qs.includeHidden === 'true';

  const seen = new Set<string>();
  const incidents: Incident[] = [];

  for (const cell of cells) {
    const res = await docClient.send(
      new QueryCommand({
        TableName: TABLES.incidents,
        IndexName: 'geohash-createdAt-index',
        KeyConditionExpression: 'geohash = :gh',
        ExpressionAttributeValues: { ':gh': cell },
      }),
    );
    if (!res.Items) continue;
    for (const item of res.Items as Incident[]) {
      if (seen.has(item.incidentId)) continue;
      seen.add(item.incidentId);

      if (!includeHidden && (item.status === 'resolved' || item.expiresAt < now)) continue;
      if (typeFilter && !typeFilter.includes(item.type)) continue;
      if (confirmedOnly && item.confirmations < 2) continue;

      if (
        item.location.lat < bounds.minLat ||
        item.location.lat > bounds.maxLat ||
        item.location.lng < bounds.minLng ||
        item.location.lng > bounds.maxLng
      )
        continue;

      incidents.push(item);
      if (incidents.length >= limit) break;
    }
    if (incidents.length >= limit) break;
  }

  const result = incidents.map((i) => ({
    ...i,
    category: i.category ?? categoryForType(i.type),
    ...computeConfidence(i.confirmations, i.negativeVotes),
  }));

  return jsonResponse(200, { incidents: result });
};

export { encodeGeohash };
