import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLES, getItem } from '../../shared/db.js';
import { withPartnerAuth, jsonResponse, errorResponse } from '../../shared/auth.js';
import { isValidIncidentId } from '../../shared/types.js';
import { categoryForType } from '../../shared/constants.js';
import { computeConfidence } from '../../shared/types.js';

export const handler = withPartnerAuth(
  async (event, auth): Promise<APIGatewayProxyResultV2> => {
    try {
      const id = event.pathParameters?.id;
      if (!id || !isValidIncidentId(id)) {
        return errorResponse(400, 'Valid incident id is required', 'bad_request');
      }

      const incident = await getItem<Record<string, unknown>>(TABLES.incidents, { incidentId: id });
      if (!incident) {
        return errorResponse(404, 'Incident not found', 'not_found');
      }

      // Sandbox partners can only see demo incidents belonging to
      // their own partner. We return 404 (not 403) so we don't leak
      // the existence of non-sandbox rows.
      if (auth.client.sandbox) {
        const isOwn = incident.partnerId === auth.partnerId;
        const isDemo = incident.isDemo === true;
        if (!isOwn || !isDemo) {
          return errorResponse(404, 'Incident not found', 'not_found');
        }
      }

      // Fetch confirmations in parallel. We don't project the citizen
      // alias here because the Confirmations table doesn't store it
      // (it's resolved server-side via BatchGet on Devices in the
      // citizen endpoint). For partner voters the deviceId is already
      // namespaced as `partner:<partnerId>:<voterId>` so it's
      // self-describing.
      const confRes = await docClient.send(new QueryCommand({
        TableName: TABLES.confirmations,
        KeyConditionExpression: 'incidentId = :id',
        ExpressionAttributeValues: { ':id': id },
        ExpressionAttributeNames: { '#a': 'action' },
        ProjectionExpression: 'deviceId, #a, createdAt',
      }));
      const confirmations = (confRes.Items ?? []).map((c) => ({
        deviceId: c.deviceId as string,
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
