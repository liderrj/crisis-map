import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { docClient, TABLES, getItem, putItem, updateItem } from '../../shared/db.js';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  EXPIRATION_WINDOW_SECONDS,
  isValidIncidentId,
  type ConfirmationAction,
  type Incident,
} from '../../shared/types.js';
import { extractDeviceContext, jsonResponse, errorResponse } from '../../shared/headers.js';

const VALID_ACTIONS: ConfirmationAction[] = ['confirm', 'improved', 'worsened', 'no_longer_exists'];

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    const device = extractDeviceContext(event.headers as Record<string, string | undefined>);
    if (!device) return errorResponse(400, 'deviceId header is required');

    let body: { incidentId?: string; action?: string };
    try {
      body = JSON.parse(event.body ?? '{}');
    } catch {
      return errorResponse(400, 'Invalid JSON body');
    }

    if (!body.incidentId || !isValidIncidentId(body.incidentId)) {
      return errorResponse(400, 'Valid incidentId is required');
    }
    if (!body.action || !VALID_ACTIONS.includes(body.action as ConfirmationAction)) {
      return errorResponse(400, 'Invalid action');
    }

    const action = body.action as ConfirmationAction;
    const incident = await getItem<Incident>(TABLES.incidents, { incidentId: body.incidentId });
    if (!incident) return errorResponse(404, 'Incident not found');

    const now = Math.floor(Date.now() / 1000);
    const created = await putItem(
      TABLES.confirmations,
      { incidentId: body.incidentId, deviceId: device.deviceId, action, createdAt: now },
      'attribute_not_exists(incidentId)',
    );

    if (!created) {
      return errorResponse(409, 'This device has already verified this incident', 'already_verified');
    }

    const expiresAt = now + EXPIRATION_WINDOW_SECONDS;

    if (action === 'no_longer_exists') {
      await updateItem(TABLES.incidents, { incidentId: body.incidentId }, 'SET #s = :r, updatedAt = :now', {
        ':r': 'resolved',
        ':now': now,
      });
      return jsonResponse(200, {
        incidentId: body.incidentId,
        status: 'resolved',
        updatedAt: now,
      });
    }

    const isWorsened = action === 'worsened';
    const update = isWorsened
      ? 'SET negativeVotes = negativeVotes + :one, updatedAt = :now'
      : 'SET confirmations = confirmations + :one, updatedAt = :now, expiresAt = :exp';
    const values: Record<string, unknown> = isWorsened
      ? { ':one': 1, ':now': now }
      : { ':one': 1, ':now': now, ':exp': expiresAt };

    await docClient.send(
      new UpdateCommand({
        TableName: TABLES.incidents,
        Key: { incidentId: body.incidentId },
        UpdateExpression: update,
        ExpressionAttributeValues: values,
      }),
    );

    const updated = await getItem<Incident>(TABLES.incidents, { incidentId: body.incidentId });
    const confirmations = updated?.confirmations ?? incident.confirmations;
    const negativeVotes = updated?.negativeVotes ?? incident.negativeVotes;
    return jsonResponse(200, {
      incidentId: body.incidentId,
      confirmations,
      negativeVotes,
      confidence: Math.max(0, confirmations - negativeVotes),
      status: updated?.status ?? 'active',
      expiresAt: updated?.expiresAt ?? expiresAt,
    });
  } catch (err) {
    console.error('Confirmations error:', err);
    return errorResponse(500, 'Internal error');
  }
};
