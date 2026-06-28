import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { docClient, TABLES } from '../../shared/db.js';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { parseBbox, coverBbox } from '../../shared/geo.js';
import { GEO_INDEX_PK } from '../../shared/db.js';
import { categoryForType } from '../../shared/constants.js';
import { computeConfidence, type Incident } from '../../shared/types.js';
import { jsonResponse, errorResponse } from '../../shared/headers.js';

const MAX_BBOX_AREA_DEG2 = 25;
const CONCURRENCY = 50;

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

    // Use precision 6 for performance (precision 7 produces 5× more prefixes
    // without noticeable accuracy improvement for crisis response).
    const prefixes = coverBbox(bounds, 6);
    const now = Math.floor(Date.now() / 1000);
    const limit = Math.min(parseInt(qs.limit ?? '100', 10), 200);

    const typeFilter = qs.type ? qs.type.split(',') : undefined;
    const confirmedOnly = qs.confirmedOnly === 'true';
    const includeHidden = qs.includeHidden === 'true';

    const results = await queryPrefixesInParallel(prefixes, CONCURRENCY);
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

async function queryPrefixesInParallel(prefixes: string[], concurrency: number): Promise<Incident[]> {
  const results: Incident[] = [];
  for (let i = 0; i < prefixes.length; i += concurrency) {
    const batch = prefixes.slice(i, i + concurrency);
    const res = await Promise.all(
      batch.map(async (prefix) => {
        const r = await docClient.send(
          new QueryCommand({
            TableName: TABLES.incidents,
            IndexName: 'geo-index',
            KeyConditionExpression: 'gsiPk = :pk AND begins_with(geohash, :prefix)',
            ExpressionAttributeValues: {
              ':pk': GEO_INDEX_PK,
              ':prefix': prefix,
            },
          }),
        );
        return (r.Items ?? []) as Incident[];
      }),
    );
    for (const arr of res) results.push(...arr);
  }
  return results;
}