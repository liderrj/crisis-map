import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getItem, TABLES } from '../../shared/db.js';
import { MAX_IMAGE_COUNT, isValidIncidentId, type Incident } from '../../shared/types.js';
import { extractDeviceContext, jsonResponse, errorResponse } from '../../shared/headers.js';

const s3 = new S3Client({
  requestChecksumCalculation: 'WHEN_REQUIRED',
});
const bucket = process.env.IMAGE_BUCKET ?? 'crisismap-images';
const URL_EXPIRES_SECONDS = 600;
const MAX_KEY_LENGTH = 200;

async function handleUpload(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const device = extractDeviceContext(event.headers as Record<string, string | undefined>);
  if (!device) return errorResponse(400, 'deviceId header is required');

  let body: { incidentId?: string; count?: number; isDemo?: boolean };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }

  if (!body.incidentId || !isValidIncidentId(body.incidentId)) {
    return errorResponse(400, 'Valid incidentId is required');
  }
  const count = Math.floor(body.count ?? 1);
  if (count < 1 || count > MAX_IMAGE_COUNT) {
    return errorResponse(400, `count must be 1..${MAX_IMAGE_COUNT}`);
  }

  const incident = await getItem<Incident>(TABLES.incidents, { incidentId: body.incidentId });
  if (!incident) return errorResponse(404, 'Incident not found');

  // Demo images live under demo/{incidentId}/ so they never collide with
  // real image paths even if the same UUID ended up re-used.
  const isDemo = incident.isDemo === true || body.isDemo === true;
  const keyRoot = isDemo ? `demo/${body.incidentId}` : body.incidentId;
  const keyPrefix = `${keyRoot}/`;

  // Count actual objects already in S3 for this incident, not the
  // incident.imageCount field. The field tracks the user's intent
  // (set on creation); the actual upload count is the source of
  // truth for "has this incident hit the limit". Using the field
  // causes a re-upload attempt to always fail because the intent
  // count was already counted at creation.
  const existing = await s3.send(new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: keyPrefix,
    MaxKeys: 1000,
  }));
  const existingCount = (existing.Contents ?? []).filter(
    (o) => typeof o.Key === 'string' && o.Key.endsWith('.webp'),
  ).length;
  if (existingCount + count > MAX_IMAGE_COUNT) {
    return errorResponse(400, `Maximum ${MAX_IMAGE_COUNT} images per incident (already ${existingCount})`);
  }

  const timestamp = Date.now();
  const uploads = [];
  for (let i = 0; i < count; i++) {
    const key = `${keyPrefix}${timestamp}-${i}.webp`;
    if (key.length > MAX_KEY_LENGTH) {
      return errorResponse(400, 'Image key too long');
    }
    const url = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: 'image/webp' }),
      { expiresIn: URL_EXPIRES_SECONDS },
    );
    uploads.push({ index: i, url, key, method: 'PUT' });
  }

  return jsonResponse(200, { incidentId: body.incidentId, uploads });
}

async function handleList(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const qs = event.queryStringParameters ?? {};
  const incidentId = qs.incidentId;
  if (!incidentId || !isValidIncidentId(incidentId)) {
    return errorResponse(400, 'Valid incidentId query parameter is required');
  }
  const includeDemo = qs.demo === '1';

  // If the caller is a non-demo session asking for a demo incident's
  // images, return empty. We resolve the incident to find out its flag.
  if (!includeDemo) {
    const incident = await getItem<Incident>(TABLES.incidents, { incidentId });
    if (incident?.isDemo === true) {
      return jsonResponse(200, { incidentId, keys: [] });
    }
  }

  const prefixes: string[] = [];
  if (includeDemo) prefixes.push(`demo/${incidentId}/`);
  prefixes.push(`${incidentId}/`);

  const seen = new Set<string>();
  for (const prefix of prefixes) {
    let token: string | undefined;
    do {
      const listed = await s3.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: MAX_IMAGE_COUNT,
        ContinuationToken: token,
      }));
      for (const o of listed.Contents ?? []) {
        if (typeof o.Key === 'string' && o.Key.endsWith('.webp')) {
          seen.add(o.Key);
        }
      }
      token = listed.NextContinuationToken;
    } while (token);
  }

  const keys = [...seen].sort();
  return jsonResponse(200, { incidentId, keys });
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    if (event.requestContext.http.method === 'GET') {
      return await handleList(event);
    }
    return await handleUpload(event);
  } catch (err) {
    console.error('Images handler error:', err);
    return errorResponse(500, 'Internal error');
  }
};

