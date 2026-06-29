import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLES, getItem } from '../../shared/db.js';
import { withPartnerAuth, jsonResponse, errorResponse } from '../../shared/auth.js';
import { isValidIncidentId, type Incident, type Severity } from '../../shared/types.js';
import { isValidSeverity } from '../../shared/constants.js';
import { sanitize } from '../../shared/headers.js';

const PATCHABLE_FIELDS = new Set(['severity', 'status', 'description']);

interface PatchBody {
  severity?: Severity;
  status?: 'active' | 'resolved';
  description?: string;
  metadata?: Record<string, string | number | boolean>;
}

export const handler = withPartnerAuth(
  async (event, auth): Promise<APIGatewayProxyResultV2> => {
    try {
      const id = event.pathParameters?.id;
      if (!id || !isValidIncidentId(id)) {
        return errorResponse(400, 'Valid incident id is required', 'bad_request');
      }

      let body: PatchBody;
      try {
        body = JSON.parse(event.body ?? '{}') as PatchBody;
      } catch {
        return errorResponse(400, 'Invalid JSON body', 'bad_request');
      }

      // Fetch existing.
      const existing = await getItem<Incident>(TABLES.incidents, { incidentId: id });
      if (!existing) return errorResponse(404, 'Incident not found', 'not_found');

      // Authorization: a partner can only mutate their own incidents.
      // Admins (future scope) would be allowed to mutate any.
      if (existing.partnerId !== auth.partnerId) {
        return errorResponse(403, 'Incident belongs to a different partner', 'forbidden');
      }
      // Sandbox partners are additionally limited to their own demo
      // rows. Anything else returns 404 (we don't leak existence).
      if (auth.client.sandbox && existing.isDemo !== true) {
        return errorResponse(404, 'Incident not found', 'not_found');
      }

      // Validate patch fields.
      const setParts: string[] = ['updatedAt = :now'];
      const removeParts: string[] = [];
      const exprValues: Record<string, unknown> = { ':now': Math.floor(Date.now() / 1000) };
      const exprNames: Record<string, string> = {};

      if (body.severity !== undefined) {
        if (!isValidSeverity(body.severity)) {
          return errorResponse(400, 'Invalid severity', 'bad_request');
        }
        setParts.push('#sv = :sv');
        exprNames['#sv'] = 'severity';
        exprValues[':sv'] = body.severity;
      }
      if (body.status !== undefined) {
        if (body.status !== 'active' && body.status !== 'resolved') {
          return errorResponse(400, 'Invalid status', 'bad_request');
        }
        setParts.push('#st = :st');
        exprNames['#st'] = 'status';
        exprValues[':st'] = body.status;
      }
      if (body.description !== undefined) {
        const sanitized = sanitize(body.description, 500);
        if (sanitized.length === 0) {
          removeParts.push('description');
        } else {
          setParts.push('#d = :d');
          exprNames['#d'] = 'description';
          exprValues[':d'] = sanitized;
        }
      }
      if (body.metadata !== undefined) {
        // Replace the metadata field wholesale (DDB SET is full-object).
        setParts.push('#m = :m');
        exprNames['#m'] = 'metadata';
        exprValues[':m'] = body.metadata;
      }

      if (setParts.length === 1 && removeParts.length === 0) {
        return errorResponse(400, 'No patchable fields supplied', 'bad_request');
      }

      const updateExpr =
        'SET ' + setParts.join(', ') +
        (removeParts.length ? ' REMOVE ' + removeParts.join(', ') : '');

      await docClient.send(new UpdateCommand({
        TableName: TABLES.incidents,
        Key: { incidentId: id },
        UpdateExpression: updateExpr,
        ...(Object.keys(exprNames).length ? { ExpressionAttributeNames: exprNames } : {}),
        ExpressionAttributeValues: exprValues,
        ConditionExpression: 'attribute_exists(incidentId)',
      }));

      // Audit log.
      try {
        const now = Math.floor(Date.now() / 1000);
        await docClient.send(new PutCommand({
          TableName: TABLES.externalActions,
          Item: {
            incidentId: id,
            timestamp: now,
            partnerId: auth.partnerId,
            action: 'patch',
            changes: body,
            requestId: (event.requestContext as { requestId?: string }).requestId ?? null,
            expiresAt: now + 90 * 24 * 60 * 60,
          },
        }));
      } catch (e) {
        console.warn('ExternalActions audit log failed:', e);
      }

      // Re-read for the response.
      const updated = await docClient.send(new GetCommand({
        TableName: TABLES.incidents,
        Key: { incidentId: id },
      }));
      const safe: Record<string, unknown> = { ...(updated.Item ?? {}) };
      delete safe.creatorDeviceId;

      return jsonResponse(200, { data: safe });
    } catch (e) {
      console.error('patch-incident-v1 error:', e);
      return errorResponse(500, 'Internal error');
    }
  },
  'incidents:write',
);
