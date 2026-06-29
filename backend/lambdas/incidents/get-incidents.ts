import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { docClient, TABLES } from '../../shared/db.js';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { parseBbox, coverBbox } from '../../shared/geo.js';
import { categoryForType } from '../../shared/constants.js';
import { computeConfidence, type Incident } from '../../shared/types.js';
import { jsonResponse, errorResponse } from '../../shared/headers.js';
import { cacheGet, cacheSet } from '../../shared/cache.js';

const MAX_BBOX_AREA_DEG2 = 25;
const SHARD_CONCURRENCY = 10;

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

    const prefixes = coverBbox(bounds, 6);
    const now = Math.floor(Date.now() / 1000);
    const limit = Math.min(parseInt(qs.limit ?? '100', 10), 200);
    const typeFilter = qs.type ? qs.type.split(',') : undefined;
    const confirmedOnly = qs.confirmedOnly === 'true';
    const includeHidden = qs.includeHidden === 'true';

    const cacheKey = `${bbox}|${qs.type ?? ''}|${confirmedOnly}|${includeHidden}|${limit}|demo=${qs.demo ?? '0'}`;

    let incidents = cacheGet<Incident[]>(cacheKey);
    if (!incidents) {
      incidents = await queryIncidents(
        prefixes, limit, now, bounds,
        typeFilter, confirmedOnly, includeHidden,
        qs.demo === '1',
      );
      cacheSet(cacheKey, incidents);
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

function groupPrefixesByShard(prefixes: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const p of prefixes) {
    const shard = p[0];
    if (!map.has(shard)) map.set(shard, []);
    map.get(shard)!.push(p);
  }
  return map;
}

function rangeForPrefix(prefix: string): { min: string; max: string } {
  const padLen = 7 - prefix.length;
  return {
    min: prefix + '0'.repeat(padLen),
    max: prefix + 'z'.repeat(padLen),
  };
}

async function queryIncidents(
  prefixes: string[],
  limit: number,
  now: number,
  bounds: { minLat: number; minLng: number; maxLat: number; maxLng: number },
  typeFilter: string[] | undefined,
  confirmedOnly: boolean | undefined,
  includeHidden: boolean | undefined,
  includeDemo: boolean,
): Promise<Incident[]> {
  const seen = new Set<string>();
  const incidents: Incident[] = [];

  // Demo-mode filter: when NOT explicitly requesting demo mode, hide incidents
  // flagged as demo. `attribute_not_exists` catches legacy rows without the field.
  // NOTE: must reference the ExpressionAttributeNames alias (#isDemo) — using the
  // raw attribute name directly would silently fail DDB validation when isDemo is in
  // the alias map but not the filter expression.
  const useDemoFilter = !includeDemo;

  const shardMap = groupPrefixesByShard(prefixes);
  const shardEntries = [...shardMap.entries()];

  for (let i = 0; i < shardEntries.length && incidents.length < limit; i += SHARD_CONCURRENCY) {
    const batch = shardEntries.slice(i, i + SHARD_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ([shard, shardPrefixes]) => {
        shardPrefixes.sort();
        const overallMin = rangeForPrefix(shardPrefixes[0]).min;
        const overallMax = rangeForPrefix(shardPrefixes[shardPrefixes.length - 1]).max;

        // Compose the full FilterExpression from individual clauses
        const filterParts: string[] = [];
        if (!includeHidden) {
          filterParts.push('#s <> :resolved');
          filterParts.push('expiresAt > :now');
        }
        if (useDemoFilter) {
          filterParts.push('attribute_not_exists(#isDemo) OR #isDemo = :false');
        }
        const filterExpr = filterParts.length ? filterParts.join(' AND ') : undefined;

        const exprValues: Record<string, unknown> = {
          ':shard': shard,
          ':min': overallMin,
          ':max': overallMax,
        };
        if (!includeHidden) {
          exprValues[':resolved'] = 'resolved';
          exprValues[':now'] = now;
        }
        if (useDemoFilter) {
          exprValues[':false'] = false;
        }

        const r = await docClient.send(
          new QueryCommand({
            TableName: TABLES.incidents,
            IndexName: 'geo-index-v2',
            KeyConditionExpression: 'gsiPkV2 = :shard AND geohash BETWEEN :min AND :max',
            ...(filterExpr ? { FilterExpression: filterExpr } : {}),
            ExpressionAttributeNames: {
              '#s': 'status',
              '#t': 'type',
              '#c': 'category',
              '#sv': 'severity',
              '#l': 'location',
              '#d': 'description',
              ...(useDemoFilter ? { '#isDemo': 'isDemo' } : {}),
            },
            ...(Object.keys(exprValues).length ? { ExpressionAttributeValues: exprValues } : {}),
            ProjectionExpression: 'incidentId,#s,#t,#c,#sv,#l,geohash,createdAt,updatedAt,confirmations,negativeVotes,imageCount,expiresAt,creatorAlias,#d,isDemo',
          }),
        );
        return (r.Items ?? []) as Incident[];
      }),
    );

    for (const items of results) {
      for (const item of items) {
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
        ) continue;
        // Defense-in-depth: filter explicitly at the SDK layer as well,
        // in case DDB FilterExpression semantics ever change.
        if (!includeDemo && item.isDemo === true) continue;

        incidents.push(item);
        if (incidents.length >= limit) return incidents;
      }
    }
  }

  return incidents;
}
