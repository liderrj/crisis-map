import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { docClient, TABLES, putItem } from '../../shared/db.js';
import { randomUUID } from 'node:crypto';
import { encodeGeohash } from '../../shared/geo.js';
import { isValidIncidentType, isValidSeverity, categoryForType } from '../../shared/constants.js';
import {
  EXPIRATION_WINDOW_SECONDS,
  MAX_ALIAS_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  type Incident,
} from '../../shared/types.js';
import { jsonResponse, errorResponse, sanitize } from '../../shared/headers.js';

interface SeedIncident {
  type: Incident['type'];
  severity: Incident['severity'];
  location: { lat: number; lng: number };
  description: string;
  confirmations: number;
  alias?: string;
  incidentId?: string;
}

const MAX_SEED_BATCH = 50;

function getHeader(headers: Record<string, string | undefined>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) return headers[k];
  }
  return undefined;
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const token = getHeader(event.headers as Record<string, string | undefined>, 'x-seed-token');
    if (!token || token !== process.env.SEED_TOKEN) {
      return errorResponse(403, 'Invalid or missing seed token');
    }

    let body: { incidents?: SeedIncident[] };
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return errorResponse(400, 'Invalid JSON body');
    }

    const incidents = Array.isArray(body.incidents) ? body.incidents : [];
    if (incidents.length === 0) return jsonResponse(200, { created: 0, skipped: 0 });
    if (incidents.length > MAX_SEED_BATCH) {
      return errorResponse(400, `Max ${MAX_SEED_BATCH} incidents per seed request`);
    }

    const now = Math.floor(Date.now() / 1000);
    let created = 0;
    let skipped = 0;

    for (const seed of incidents) {
      if (!seed.type || !isValidIncidentType(seed.type)) { skipped++; continue; }
      if (!seed.severity || !isValidSeverity(seed.severity)) { skipped++; continue; }
      if (
        !seed.location ||
        typeof seed.location.lat !== 'number' ||
        typeof seed.location.lng !== 'number' ||
        seed.location.lat < -90 || seed.location.lat > 90 ||
        seed.location.lng < -180 || seed.location.lng > 180
      ) { skipped++; continue; }

      const incidentId = seed.incidentId ?? randomUUID();
      const description = sanitize(seed.description ?? '', MAX_DESCRIPTION_LENGTH);
      const alias = seed.alias ? seed.alias.slice(0, MAX_ALIAS_LENGTH) : 'system';

      const incident: Incident = {
        incidentId,
        type: seed.type,
        category: categoryForType(seed.type),
        severity: seed.severity,
        status: 'active',
        location: seed.location,
        geohash: encodeGeohash(seed.location.lat, seed.location.lng),
        description: description || undefined,
        createdAt: now,
        updatedAt: now,
        expiresAt: now + EXPIRATION_WINDOW_SECONDS * 4,
        creatorAlias: alias,
        creatorDeviceId: 'system-seed',
        confirmations: Math.max(1, Math.min(20, seed.confirmations ?? 1)),
        negativeVotes: 0,
        imageCount: 0,
      };

      const ok = await putItem(
        TABLES.incidents,
        incident as unknown as Record<string, unknown>,
        'attribute_not_exists(incidentId)',
      );
      if (ok) created++;
      else skipped++;
    }

    return jsonResponse(200, { created, skipped });
  } catch (err) {
    console.error('Seed handler error:', err);
    return errorResponse(500, 'Internal error');
  }
};

void docClient;