import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLES } from '../../shared/db.js';
import { withPartnerAuth, jsonResponse, errorResponse } from '../../shared/auth.js';
import { isValidIncidentId } from '../../shared/types.js';

export const handler = withPartnerAuth(
  async (event): Promise<APIGatewayProxyResultV2> => {
    try {
      const id = event.pathParameters?.id;
      if (!id || !isValidIncidentId(id)) {
        return errorResponse(400, 'Valid incident id is required', 'bad_request');
      }
      const qs = event.queryStringParameters ?? {};
      const since = qs.since !== undefined ? Number.parseInt(qs.since, 10) : undefined;
      const until = qs.until !== undefined ? Number.parseInt(qs.until, 10) : undefined;
      if (since !== undefined && Number.isNaN(since)) {
        return errorResponse(400, 'Invalid since (epoch seconds)', 'bad_request');
      }
      if (until !== undefined && Number.isNaN(until)) {
        return errorResponse(400, 'Invalid until (epoch seconds)', 'bad_request');
      }

      const exprValues: Record<string, unknown> = { ':id': id };
      const filterParts: string[] = [];
      if (since !== undefined) {
        filterParts.push('createdAt >= :since');
        exprValues[':since'] = since;
      }
      if (until !== undefined) {
        filterParts.push('createdAt <= :until');
        exprValues[':until'] = until;
      }

      const res = await docClient.send(new QueryCommand({
        TableName: TABLES.confirmations,
        KeyConditionExpression: 'incidentId = :id' + (since !== undefined ? ' AND createdAt >= :since' : ''),
        ...(filterParts.length ? { FilterExpression: filterParts.join(' AND ') } : {}),
        ExpressionAttributeValues: exprValues,
      }));

      const items = (res.Items ?? []).map((c) => ({
        deviceId: c.deviceId as string,
        action: c.action as string,
        createdAt: c.createdAt as number,
      }));

      return jsonResponse(200, { incidentId: id, data: items, count: items.length });
    } catch (e) {
      console.error('get-confirmations-v1 error:', e);
      return errorResponse(500, 'Internal error');
    }
  },
  'confirmations:read',
);
