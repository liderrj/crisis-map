import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLES } from './db.js';
import { coverBbox, haversineMeters, parseBbox, type GeoBounds } from './geo.js';
import { categoryForType } from './constants.js';
import { computeConfidence, type Incident, type IncidentType, type Severity, type IncidentStatus, type IncidentCategory } from './types.js';

const MAX_BBOX_AREA_DEG2 = 25;
const SHARD_CONCURRENCY = 10;
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 100;

export interface ListFilters {
  bbox?: string;
  geohash?: string;
  center?: { lat: number; lng: number };
  radius?: number; // meters
  types?: IncidentType[];
  categories?: IncidentCategory[];
  severities?: Severity[];
  statuses?: IncidentStatus[];
  since?: number; // epoch seconds
  until?: number;
  minConfidence?: number;
  source?: string; // e.g. "citizen" or "partner:bomberos-caracas"
  includeDemo?: boolean;
  limit: number;
  nextToken?: string;
  sort: 'createdAt' | 'updatedAt' | 'confidence';
  order: 'asc' | 'desc';
}

/** Parses and validates query-string filters. Throws on invalid input. */
export function parseFilters(qs: Record<string, string | undefined>): ListFilters {
  const limit = Math.min(Math.max(parseInt(qs.limit ?? `${DEFAULT_LIMIT}`, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  let bbox: string | undefined;
  if (qs.bbox) {
    const b = parseBbox(qs.bbox);
    if (!b) throw new BadRequest('Invalid bbox. Expected minLng,minLat,maxLng,maxLat');
    const w = b.maxLng - b.minLng;
    const h = b.maxLat - b.minLat;
    if (w <= 0 || h <= 0 || w * h > MAX_BBOX_AREA_DEG2) {
      throw new BadRequest(`bbox too large (max ${MAX_BBOX_AREA_DEG2} deg^2). Zoom in.`);
    }
    bbox = qs.bbox;
  }

  let center: { lat: number; lng: number } | undefined;
  if (qs.center) {
    const parts = qs.center.split(',').map((p) => Number.parseFloat(p.trim()));
    if (parts.length !== 2 || parts.some(Number.isNaN)) {
      throw new BadRequest('Invalid center. Expected lat,lng');
    }
    center = { lat: parts[0], lng: parts[1] };
  }

  let radius: number | undefined;
  if (qs.radius !== undefined) {
    radius = Number.parseFloat(qs.radius);
    if (Number.isNaN(radius) || radius <= 0) {
      throw new BadRequest('Invalid radius (positive meters)');
    }
  }
  if ((center && !radius) || (!center && radius)) {
    throw new BadRequest('center and radius must be provided together');
  }

  const types = qs.type
    ? qs.type.split(',').map((s) => s.trim()).filter(Boolean) as IncidentType[]
    : undefined;
  const categories = qs.category
    ? qs.category.split(',').map((s) => s.trim()).filter(Boolean) as IncidentCategory[]
    : undefined;
  const severities = qs.severity
    ? qs.severity.split(',').map((s) => s.trim()).filter(Boolean) as Severity[]
    : undefined;
  const statuses = qs.status
    ? qs.status.split(',').map((s) => s.trim()).filter(Boolean) as IncidentStatus[]
    : (['active'] as IncidentStatus[]); // default to active only

  const since = qs.since !== undefined ? Number.parseInt(qs.since, 10) : undefined;
  const until = qs.until !== undefined ? Number.parseInt(qs.until, 10) : undefined;
  if (since !== undefined && Number.isNaN(since)) throw new BadRequest('Invalid since (epoch seconds)');
  if (until !== undefined && Number.isNaN(until)) throw new BadRequest('Invalid until (epoch seconds)');

  const minConfidence = qs.minConfidence !== undefined ? Number.parseInt(qs.minConfidence, 10) : undefined;
  if (minConfidence !== undefined && (Number.isNaN(minConfidence) || minConfidence < 0)) {
    throw new BadRequest('Invalid minConfidence (>=0)');
  }

  const sort = (qs.sort as ListFilters['sort']) ?? 'createdAt';
  if (!['createdAt', 'updatedAt', 'confidence'].includes(sort)) {
    throw new BadRequest('Invalid sort');
  }
  const order = (qs.order as ListFilters['order']) ?? 'desc';
  if (!['asc', 'desc'].includes(order)) {
    throw new BadRequest('Invalid order');
  }

  return {
    bbox,
    geohash: qs.geohash,
    center,
    radius,
    types,
    categories,
    severities,
    statuses,
    since,
    until,
    minConfidence,
    source: qs.source,
    includeDemo: qs.demo === '1',
    limit,
    nextToken: qs.nextToken,
    sort,
    order,
  };
}

export class BadRequest extends Error {
  readonly status = 400 as const;
  constructor(message: string) { super(message); this.name = 'BadRequest'; }
}

/** Query result with opaque base64 cursor for pagination. */
export interface ListResult {
  incidents: Incident[];
  nextToken: string | undefined;
}

/**
 * Lists incidents matching the given filters. Uses geo-index-v2 when
 * a bbox is given, falls back to a partner-source-index scan when only
 * a source filter is set, and uses the type-geohash-index when only a
 * type filter is set.
 *
 * For MVP, sort=confidence is computed in-memory after fetching a
 * page; for full sort on DynamoDB, an LSI on (gsiPkV2, confidence) is
 * the next step (out of scope here).
 */
export async function listIncidents(filters: ListFilters): Promise<ListResult> {
  // Route to the appropriate index.
  if (filters.bbox) {
    return listByBbox(filters);
  }
  if (filters.source?.startsWith('partner:')) {
    return listByPartner(filters);
  }
  if (filters.geohash) {
    return listByGeohashPrefix(filters);
  }
  // Last resort: full scan with early termination. Only allowed when
  // the partner explicitly opted in (or for admin scopes).
  throw new BadRequest('At least one of bbox, geohash or source=partner:<id> is required');
}

async function listByBbox(filters: ListFilters): Promise<ListResult> {
  const bounds = parseBbox(filters.bbox!)!;
  const prefixes = coverBbox(bounds, 6);
  const now = Math.floor(Date.now() / 1000);
  const shardMap = groupPrefixesByShard(prefixes);
  const shardEntries = [...shardMap.entries()];

  const seen = new Set<string>();
  const out: Incident[] = [];

  for (let i = 0; i < shardEntries.length && out.length < filters.limit; i += SHARD_CONCURRENCY) {
    const batch = shardEntries.slice(i, i + SHARD_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ([shard, shardPrefixes]) => {
        shardPrefixes.sort();
        const overallMin = rangeForPrefix(shardPrefixes[0]).min;
        const overallMax = rangeForPrefix(shardPrefixes[shardPrefixes.length - 1]).max;

        const filterParts: string[] = [];
        const exprNames: Record<string, string> = {};
        const exprValues: Record<string, unknown> = {
          ':shard': shard,
          ':min': overallMin,
          ':max': overallMax,
        };

        // Status filter
        if (filters.statuses && filters.statuses.length > 0) {
          const statusPlaceholders = filters.statuses.map((_, i) => `:s${i}`).join(',');
          filterParts.push(`#s IN (${statusPlaceholders})`);
          exprNames['#s'] = 'status';
          filters.statuses.forEach((s, i) => { exprValues[`:s${i}`] = s; });
        }
        if (filters.since !== undefined) {
          filterParts.push('createdAt >= :since');
          exprValues[':since'] = filters.since;
        }
        if (filters.until !== undefined) {
          filterParts.push('createdAt <= :until');
          exprValues[':until'] = filters.until;
        }
        if (!filters.includeDemo) {
          filterParts.push('(attribute_not_exists(#isDemo) OR #isDemo = :false)');
          exprNames['#isDemo'] = 'isDemo';
          exprValues[':false'] = false;
        }
        if (filters.source) {
          filterParts.push('#src = :source');
          exprNames['#src'] = 'source';
          exprValues[':source'] = filters.source;
        }

        const r = await docClient.send(
          new QueryCommand({
            TableName: TABLES.incidents,
            IndexName: 'geo-index-v2',
            KeyConditionExpression: 'gsiPkV2 = :shard AND geohash BETWEEN :min AND :max',
            ...(filterParts.length ? { FilterExpression: filterParts.join(' AND ') } : {}),
            ...(Object.keys(exprNames).length ? { ExpressionAttributeNames: exprNames } : {}),
            ExpressionAttributeValues: exprValues,
          }),
        );
        return (r.Items ?? []) as Incident[];
      }),
    );

    for (const items of results) {
      for (const item of items) {
        if (seen.has(item.incidentId)) continue;
        seen.add(item.incidentId);

        if (!matchesPostFilters(item, bounds, filters)) continue;
        out.push(item);
        if (out.length >= filters.limit) break;
      }
    }
    if (out.length >= filters.limit) break;
  }

  // In-memory sort if requested on confidence. createdAt/updatedAt come
  // back in geohash order, which doesn't match chronological order, so
  // we re-sort here too.
  sortResults(out, filters.sort, filters.order);
  return { incidents: out, nextToken: undefined };
}

async function listByPartner(filters: ListFilters): Promise<ListResult> {
  // partner-source-index: PK = partnerId, SK = createdAt.
  // We have `source = "partner:<partnerId>"`, but the index PK is the
  // bare partnerId. Caller is expected to know what to query.
  // For MVP we expect source to look like "partner:<id>" and we extract <id>.
  //
  // NOTE: this GSI is added in a second deploy (DDB only allows one new
  // GSI per table update). Until then, partner-scoped listing falls
  // back to a bbox-required query.
  const partnerId = filters.source!.slice('partner:'.length);
  const now = Math.floor(Date.now() / 1000);
  const filterParts: string[] = [];
  const exprNames: Record<string, string> = {};
  const exprValues: Record<string, unknown> = {};

  if (filters.statuses && filters.statuses.length > 0) {
    const placeholders = filters.statuses.map((_, i) => `:s${i}`).join(',');
    filterParts.push(`#s IN (${placeholders})`);
    exprNames['#s'] = 'status';
    filters.statuses.forEach((s, i) => { exprValues[`:s${i}`] = s; });
  }
  if (filters.since !== undefined) {
    filterParts.push('createdAt >= :since');
    exprValues[':since'] = filters.since;
  }
  if (filters.until !== undefined) {
    filterParts.push('createdAt <= :until');
    exprValues[':until'] = filters.until;
  }

  const r = await docClient.send(
    new QueryCommand({
      TableName: TABLES.incidents,
      IndexName: 'partner-source-index',
      KeyConditionExpression: 'partnerId = :pid' + (filters.since !== undefined ? ' AND createdAt >= :since' : ''),
      ...(filterParts.length ? { FilterExpression: filterParts.join(' AND ') } : {}),
      ...(Object.keys(exprNames).length ? { ExpressionAttributeNames: exprNames } : {}),
      ExpressionAttributeValues: { ':pid': partnerId, ...exprValues },
      ScanIndexForward: filters.order === 'asc',
      Limit: filters.limit,
    }),
  );

  const items = (r.Items ?? []) as Incident[];
  const seen = new Set<string>();
  const out: Incident[] = [];
  for (const item of items) {
    if (seen.has(item.incidentId)) continue;
    seen.add(item.incidentId);
    if (!matchesPostFilters(item, null, filters)) continue;
    out.push(item);
  }

  sortResults(out, filters.sort, filters.order);
  return { incidents: out, nextToken: undefined };
}

async function listByGeohashPrefix(filters: ListFilters): Promise<ListResult> {
  // For MVP we just refuse if only geohash is set (requires additional
  // Query against the base table using geohash as sort key, which is
  // not part of any GSI today). Partners should pass bbox.
  throw new BadRequest('geohash-only listing is not supported in v1; use bbox');
}

function matchesPostFilters(item: Incident, bounds: GeoBounds | null, filters: ListFilters): boolean {
  if (item.expiresAt && item.expiresAt < Math.floor(Date.now() / 1000)) return false;
  if (filters.types && !filters.types.includes(item.type)) return false;
  if (filters.categories) {
    const cat = item.category ?? categoryForType(item.type);
    if (!filters.categories.includes(cat)) return false;
  }
  if (filters.severities && !filters.severities.includes(item.severity)) return false;
  if (bounds) {
    if (
      item.location.lat < bounds.minLat || item.location.lat > bounds.maxLat ||
      item.location.lng < bounds.minLng || item.location.lng > bounds.maxLng
    ) return false;
  }
  if (filters.center && filters.radius) {
    const d = haversineMeters(item.location.lat, item.location.lng, filters.center.lat, filters.center.lng);
    if (d > filters.radius) return false;
  }
  if (filters.minConfidence !== undefined) {
    const c = computeConfidence(item.confirmations, item.negativeVotes).confidence;
    if (c < filters.minConfidence) return false;
  }
  return true;
}

function sortResults(items: Incident[], sort: ListFilters['sort'], order: ListFilters['order']): void {
  const dir = order === 'asc' ? 1 : -1;
  items.sort((a, b) => {
    let av: number; let bv: number;
    if (sort === 'confidence') {
      av = computeConfidence(a.confirmations, a.negativeVotes).confidence;
      bv = computeConfidence(b.confirmations, b.negativeVotes).confidence;
    } else if (sort === 'updatedAt') {
      av = a.updatedAt; bv = b.updatedAt;
    } else {
      av = a.createdAt; bv = b.createdAt;
    }
    return (av - bv) * dir;
  });
}

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
