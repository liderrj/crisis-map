import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { docClient, TABLES } from '../../shared/db.js';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { parseBbox, bboxToGeohashCells } from '../../shared/geo.js';
import { categoryForType } from '../../shared/constants.js';
import { computeConfidence, type Incident } from '../../shared/types.js';
import { jsonResponse, errorResponse } from '../../shared/headers.js';

const MAX_BBOX_AREA_DEG2 = 25;
const MAX_CELLS = 2000;
const CONCURRENCY = 20;

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const qs = event.queryStringParameters ?? {};
    const bbox = qs.bbox;
    if (!bbox) return errorResponse(400, 'bbox query parameter is required');

    const bounds = parseBbox(bbox);
    if (!bounds) return errorResponse(400, 'Invalid bbox format. Expected minLng,minLat,maxLng,maxLat');

    const width = bounds.maxLng - bounds.minLng;
    const height = bounds.maxLat - bounds.minLat;
    if (width <= 0 || height <= 0 || width * height > MAX_BBOX_AREA_DEG2) {
      return errorResponse(400, `bbox too large (max ${MAX_BBOX_AREA_DEG2} deg^2). Zoom in.`);
    }

    const cells = bboxToGeohashCells(bounds).slice(0, MAX_CELLS);
    const now = Math.floor(Date.now() / 1000);
    const limit = Math.min(parseInt(qs.limit ?? '100', 10), 200);

    const typeFilter = qs.type ? qs.type.split(',') : undefined;
    const confirmedOnly = qs.confirmedOnly === 'true';
    const includeHidden = qs.includeHidden === 'true';

    const results = await queryCellsInParallel(cells, CONCURRENCY);
    const seen = new Set<string>();
    const incidents: Incident[] = [];
    for (const item of results) {
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

    return jsonResponse(200, {
      incidents: incidents.map((i) => ({
        ...i,
        category: i.category ?? categoryForType(i.type),
        ...computeConfidence(i.confirmations, i.negativeVotes),
      })),
    });
  } catch (err) {
    console.error('GetIncidents error:', err);
    return errorResponse(500, 'Internal error');
  }
};

async function queryCellsInParallel(cells: string[], concurrency: number): Promise<Incident[]> {
  const results: Incident[] = [];
  for (let i = 0; i < cells.length; i += concurrency) {
    const batch = cells.slice(i, i + concurrency);
    const res = await Promise.all(
      batch.map(async (cell) => {
        const r = await docClient.send(
          new QueryCommand({
            TableName: TABLES.incidents,
            IndexName: 'geohash-createdAt-index',
            KeyConditionExpression: 'begins_with(geohash, :gh)',
            ExpressionAttributeValues: { ':gh': cell },
          }),
        );
        return (r.Items ?? []) as Incident[];
      }),
    );
    for (const arr of res) results.push(...arr);
  }
  return results;
}