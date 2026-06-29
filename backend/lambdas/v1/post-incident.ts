import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLES, putItem } from '../../shared/db.js';
import { withPartnerAuth, jsonResponse, errorResponse } from '../../shared/auth.js';
import { encodeGeohash } from '../../shared/geo.js';
import { isValidIncidentType, isValidSeverity, categoryForType } from '../../shared/constants.js';
import {
  EXPIRATION_WINDOW_SECONDS,
  MAX_DESCRIPTION_LENGTH,
  MAX_IMAGE_COUNT,
  type Incident,
  type IncidentType,
  type Severity,
} from '../../shared/types.js';
import { sanitize } from '../../shared/headers.js';
import { rehostImage } from '../../shared/external-images.js';

interface PostBody {
  externalId?: string;
  type: IncidentType;
  severity: Severity;
  location: { lat: number; lng: number };
  description?: string;
  imageUrls?: string[];
  source?: string;
  reportedAt?: number;
  metadata?: Record<string, string | number | boolean>;
}

export const handler = withPartnerAuth(
  async (event, auth): Promise<APIGatewayProxyResultV2> => {
    try {
      let body: PostBody;
      try {
        body = JSON.parse(event.body ?? '{}') as PostBody;
      } catch {
        return errorResponse(400, 'Invalid JSON body', 'bad_request');
      }

      // Validate.
      if (!body.type || !isValidIncidentType(body.type)) {
        return errorResponse(400, 'Invalid or missing type', 'bad_request');
      }
      if (!body.severity || !isValidSeverity(body.severity)) {
        return errorResponse(400, 'Invalid or missing severity', 'bad_request');
      }
      if (
        !body.location ||
        typeof body.location.lat !== 'number' || typeof body.location.lng !== 'number' ||
        body.location.lat < -90 || body.location.lat > 90 ||
        body.location.lng < -180 || body.location.lng > 180
      ) {
        return errorResponse(400, 'Invalid or missing location', 'bad_request');
      }
      if (body.imageUrls && (!Array.isArray(body.imageUrls) || body.imageUrls.length > MAX_IMAGE_COUNT)) {
        return errorResponse(400, `imageUrls must be 0..${MAX_IMAGE_COUNT} entries`, 'bad_request');
      }

      // Idempotency: if externalId is set, look up by composite key.
      // On hit, return the existing row (200, not 201) so the partner
      // can safely retry without producing duplicates.
      const partnerSource = `partner:${auth.partnerId}`;
      if (body.externalId) {
        const externalKey = `${auth.partnerId}#${body.externalId}`;
        const existing = await docClient.send(new QueryCommand({
          TableName: TABLES.incidents,
          IndexName: 'external-id-index',
          KeyConditionExpression: 'externalKey = :k',
          ExpressionAttributeValues: { ':k': externalKey },
          Limit: 1,
        }));
        if (existing.Items && existing.Items.length > 0) {
          const item = existing.Items[0] as Incident;
          return jsonResponse(200, {
            incidentId: item.incidentId,
            externalId: body.externalId,
            status: item.status,
            createdAt: item.createdAt,
            idempotent: true,
          });
        }
      }

      // Use a stable id (deterministic from externalId) when present so
      // a partner's two different services reporting the same external
      // incident end up with the same row. Otherwise a fresh UUID.
      const incidentId = body.externalId
        ? deterministicIncidentId(auth.partnerId, body.externalId)
        : randomUUID();

      // Rehost external images (best-effort, partial success is OK).
      const imageResults: Array<{ sourceUrl: string; cdnUrl: string; key: string; contentType: string; size: number } | { sourceUrl: string; error: { code: string; message: string } }> = [];
      if (body.imageUrls && body.imageUrls.length > 0) {
        for (let i = 0; i < body.imageUrls.length; i++) {
          const url = body.imageUrls[i];
          try {
            const r = await rehostImage(url, incidentId, i);
            if (r.ok) {
              imageResults.push({ sourceUrl: url, cdnUrl: r.image.cdnUrl, key: r.image.key, contentType: r.image.contentType, size: r.image.size });
            } else {
              imageResults.push({ sourceUrl: url, error: { code: r.code, message: r.message } });
            }
          } catch (e) {
            imageResults.push({ sourceUrl: url, error: { code: 'unknown', message: (e as Error).message } });
          }
        }
      }

      const now = Math.floor(Date.now() / 1000);
      const reportedAt = body.reportedAt && body.reportedAt > 0 ? body.reportedAt : now;
      const geohash = encodeGeohash(body.location.lat, body.location.lng);

      // Sandbox-mode partners always write into the demo bucket. Their
      // incidents are hidden from non-demo sessions and never appear on
      // the citizen map. The client cannot opt out of this; it's set
      // server-side based on the OAuthClientsTable row.
      const isDemo = auth.client.sandbox;

      const incident: Incident = {
        incidentId,
        type: body.type,
        category: categoryForType(body.type),
        severity: body.severity,
        status: 'active',
        location: body.location,
        geohash,
        description: body.description
          ? sanitize(body.description, MAX_DESCRIPTION_LENGTH)
          : undefined,
        createdAt: reportedAt,
        updatedAt: now,
        expiresAt: now + EXPIRATION_WINDOW_SECONDS,
        creatorAlias: auth.partnerId, // public alias = partner name
        creatorDeviceId: `partner:${auth.partnerId}`,
        confirmations: 1,
        negativeVotes: 0,
        imageCount: imageResults.filter((r) => 'cdnUrl' in r).length,
        gsiPkV2: geohash[0],
        source: partnerSource,
        partnerId: auth.partnerId,
        externalId: body.externalId,
        externalKey: body.externalId ? `${auth.partnerId}#${body.externalId}` : undefined,
        metadata: body.metadata,
        isDemo: isDemo ? true : undefined,
      };

      // Put with conditional create: if a concurrent request beat us to
      // the same incidentId (deterministic collision), return the
      // existing row instead of overwriting.
      const created = await putItem(
        TABLES.incidents,
        incident as unknown as Record<string, unknown>,
        'attribute_not_exists(incidentId)',
      );

      if (!created) {
        const existing = await docClient.send(new QueryCommand({
          TableName: TABLES.incidents,
          IndexName: 'external-id-index',
          KeyConditionExpression: 'externalKey = :k',
          ExpressionAttributeValues: { ':k': incident.externalKey },
          Limit: 1,
        }));
        const item = (existing.Items?.[0] ?? {}) as Incident;
        return jsonResponse(200, {
          incidentId: item.incidentId ?? incidentId,
          externalId: body.externalId,
          status: item.status ?? 'active',
          createdAt: item.createdAt ?? reportedAt,
          idempotent: true,
        });
      }

      // Audit log (best-effort).
      try {
        await docClient.send(new PutCommand({
          TableName: TABLES.externalActions,
          Item: {
            incidentId,
            timestamp: now,
            partnerId: auth.partnerId,
            action: 'create',
            requestId: (event.requestContext as { requestId?: string }).requestId ?? null,
            imageResults,
            metadata: body.metadata ?? null,
            expiresAt: now + 90 * 24 * 60 * 60, // 90d TTL
          },
        }));
      } catch (e) {
        console.warn('ExternalActions audit log failed:', e);
      }

      return jsonResponse(201, {
        incidentId,
        externalId: body.externalId,
        status: 'active',
        createdAt: reportedAt,
        isDemo: isDemo || undefined,
        images: imageResults,
      });
    } catch (e) {
      console.error('post-incident-v1 error:', e);
      return errorResponse(500, 'Internal error');
    }
  },
  'incidents:write',
);

/** Deterministic UUID v4-like id from `${partnerId}:${externalId}`. */
function deterministicIncidentId(partnerId: string, externalId: string): string {
  // Lazy import so the rest of the file stays simple.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  const h = createHash('sha256').update(`${partnerId}:${externalId}`).digest();
  // Set the version (4) and variant (RFC 4122) bits so the result looks
  // like a UUID v4 to the existing incidentId regex.
  h[6] = (h[6] & 0x0f) | 0x40;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
