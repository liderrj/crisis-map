import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getItem, TABLES } from '../../shared/db.js';
import { MAX_IMAGE_COUNT, type Incident } from '../../shared/types.js';
import { extractDeviceContext, jsonResponse, errorResponse } from '../../shared/headers.js';

const s3 = new S3Client({});
const bucket = process.env.IMAGE_BUCKET ?? 'crisismap-images';

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const device = extractDeviceContext(event.headers as Record<string, string | undefined>);
  if (!device) return errorResponse(400, 'deviceId header is required');

  let body: { incidentId?: string; count?: number };
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return errorResponse(400, 'Invalid JSON body');
  }

  if (!body.incidentId) return errorResponse(400, 'incidentId is required');
  const count = body.count ?? 1;
  if (count < 1) return errorResponse(400, 'count must be >= 1');

  const incident = await getItem<Incident>(TABLES.incidents, { incidentId: body.incidentId });
  if (!incident) return errorResponse(404, 'Incident not found');

  if (incident.imageCount + count > MAX_IMAGE_COUNT) {
    return errorResponse(400, `Maximum ${MAX_IMAGE_COUNT} images per incident`);
  }

  const uploads = [];
  for (let i = 0; i < count; i++) {
    const key = `${body.incidentId}/${Date.now()}-${i}.webp`;
    const url = await getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: 'image/webp' }), {
      expiresIn: 300,
    });
    uploads.push({ index: i, url, key, method: 'PUT' });
  }

  return jsonResponse(200, { incidentId: body.incidentId, uploads });
};
