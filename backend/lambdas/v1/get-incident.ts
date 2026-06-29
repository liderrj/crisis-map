import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLES, getItem } from '../../shared/db.js';
import { withPartnerAuth, jsonResponse, errorResponse } from '../../shared/auth.js';
import { isValidIncidentId } from '../../shared/types.js';
import { categoryForType } from '../../shared/constants.js';
import { computeConfidence } from '../../shared/types.js';

export const handler = withPartnerAuth(
  async (event): Promise<APIGatewayProxyResultV2> => {
    try {
      const id = event.pathParameters?.id;
      if (!id || !isValidIncidentId(id)) {
        return errorResponse(400, 'Valid incident id is required', 'bad_request');
      }

      const incident = await getItem<Record<string, unknown>>(TABLES.incidents, { incidentId: id });
      if (!incident) {
        return errorResponse(404, 'Incident not found', 'not_found');
      }

      // Fetch confirmations in parallel.
      const confRes = await docClient.send(new QueryCommand({
        TableName: TABLES.confirmations,
        KeyConditionExpression: 'incidentId = :id',
        ExpressionAttributeValues: { ':id': id },
        ExpressionAttributeNames: { '#a': 'action' },
        ProjectionExpression: 'deviceId, #a, createdAt, alias',
      }));
      const confirmations = (confRes.Items ?? []).map((c) => ({
        deviceId: c.deviceId as string,
        // Confirmation table does not store alias directly; alias is
        // surfaced via batch-resolve on the citizen endpoint, but for v1
        // we just echo the deviceId-prefixed label to avoid a second
        // round-trip. Partner can join with /devices/quota if needed.
        alias: undefined as string | undefined,
        action: c.action as string,
        createdAt: c.createdAt as number,
      }));

      // Strip PII (creatorDeviceId) before returning to partners. The
      // alias is already public on the map, so we keep it.
      const safe: Record<string, unknown> = { ...incident };
      delete safe.creatorDeviceId;
      // Re-derive category + confidence server-side so the response is
      // self-describing.
      const type = safe.type as Parameters<typeof categoryForType>[0];
      safe.category = safe.category ?? categoryForType(type);
      const conf = computeConfidence(
        (safe.confirmations as number) ?? 0,
        (safe.negativeVotes as number) ?? 0,
      );
      safe.confidence = conf.confidence;

      return jsonResponse(200, { data: { ...safe, confirmations } });
    } catch (e) {
      console.error('get-incident-v1 error:', e);
      return errorResponse(500, 'Internal error');
    }
  },
  'incidents:read',
);
