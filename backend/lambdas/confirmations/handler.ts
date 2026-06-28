import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { docClient, TABLES, getItem, putItem, updateItem } from '../../shared/db.js';
import { UpdateCommand, ScanCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import {
  EXPIRATION_WINDOW_SECONDS,
  isValidIncidentId,
  type ConfirmationAction,
  type Incident,
  type Device,
} from '../../shared/types.js';
import { extractDeviceContext, jsonResponse, errorResponse } from '../../shared/headers.js';

const VALID_ACTIONS: ConfirmationAction[] = ['confirm', 'improved', 'worsened', 'no_longer_exists'];

/** Public response shape: the alias is resolved server-side so the
 *  client doesn't need a second round-trip to the Devices table. */
interface ConfirmationResponse {
  deviceId: string;
  alias: string;
  action: ConfirmationAction;
  createdAt: number;
}

async function handleList(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const incidentId = event.queryStringParameters?.incidentId;
  if (!incidentId || !isValidIncidentId(incidentId)) {
    return errorResponse(400, 'Valid incidentId query parameter is required');
  }

  // Confirmations is small per incident (one row per device) so a
  // Scan with FilterExpression is fine. If this becomes hot we'd add
  // a GSI on incidentId.
  const scan = await docClient.send(
    new ScanCommand({
      TableName: TABLES.confirmations,
      FilterExpression: 'incidentId = :id',
      ExpressionAttributeValues: { ':id': incidentId },
    }),
  );
  const rows = (scan.Items ?? []) as Array<{
    deviceId: string;
    action: ConfirmationAction;
    createdAt: number;
  }>;

  if (rows.length === 0) {
    return jsonResponse(200, { incidentId, confirmations: [] });
  }

  // Batch-resolve aliases in one round-trip. Max 100 keys per request.
  const aliases = new Map<string, string>();
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100).map((r) => r.deviceId);
    const res = await docClient.send(
      new BatchGetCommand({
        RequestItems: {
          [TABLES.devices]: {
            Keys: batch.map((deviceId) => ({ deviceId })),
            ProjectionExpression: 'deviceId, alias',
          },
        },
      }),
    );
    for (const item of (res.Responses?.[TABLES.devices] ?? []) as Device[]) {
      if (item.alias) aliases.set(item.deviceId, item.alias);
    }
  }

  const response: ConfirmationResponse[] = rows
    .map((r) => ({
      deviceId: r.deviceId,
      alias: aliases.get(r.deviceId) ?? '',
      action: r.action,
      createdAt: r.createdAt,
    }))
    .sort((a, b) => a.createdAt - b.createdAt);

  return jsonResponse(200, { incidentId, confirmations: response });
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    if (event.requestContext.http.method === 'GET') {
      return await handleList(event);
    }

    // POST: write path. The deviceId header (case-insensitive) is
    // required so the confirmation can be attributed to a real
    // device and we can later resolve an alias for the UI.
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

    const device = extractDeviceContext(event.headers as Record<string, string | undefined>);
    if (!device) return errorResponse(400, 'deviceId header is required');

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

    // Best-effort device upsert so we can resolve aliases later.
    await putItem(
      TABLES.devices,
      { deviceId: device.deviceId, alias: device.alias, lastSeen: now },
    );

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
