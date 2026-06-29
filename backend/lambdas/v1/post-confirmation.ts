import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLES, putItem, getItem } from '../../shared/db.js';
import { withPartnerAuth, jsonResponse, errorResponse } from '../../shared/auth.js';
import {
  EXPIRATION_WINDOW_SECONDS,
  isValidIncidentId,
  type ConfirmationAction,
  type Incident,
  computeConfidence,
} from '../../shared/types.js';

const VALID_ACTIONS: ConfirmationAction[] = ['confirm', 'improved', 'worsened', 'no_longer_exists'];

interface PostBody {
  action: ConfirmationAction;
  voterId: string; // partner's stable id for the voter
  voterAlias?: string;
}

export const handler = withPartnerAuth(
  async (event, auth): Promise<APIGatewayProxyResultV2> => {
    try {
      const incidentId = event.pathParameters?.id;
      if (!incidentId || !isValidIncidentId(incidentId)) {
        return errorResponse(400, 'Valid incident id is required', 'bad_request');
      }
      let body: PostBody;
      try {
        body = JSON.parse(event.body ?? '{}') as PostBody;
      } catch {
        return errorResponse(400, 'Invalid JSON body', 'bad_request');
      }
      if (!body.action || !VALID_ACTIONS.includes(body.action)) {
        return errorResponse(400, 'Invalid action', 'bad_request');
      }
      if (!body.voterId || body.voterId.length > 64) {
        return errorResponse(400, 'voterId is required (<=64 chars)', 'bad_request');
      }

      const incident = await getItem<Incident>(TABLES.incidents, { incidentId });
      if (!incident) return errorResponse(404, 'Incident not found', 'not_found');

      // The composite key uses the partner-prefixed voterId so a
      // partner cannot double-vote on the same incident.
      const externalDeviceId = `partner:${auth.partnerId}:${body.voterId}`;
      const now = Math.floor(Date.now() / 1000);

      const created = await putItem(
        TABLES.confirmations,
        {
          incidentId,
          deviceId: externalDeviceId,
          action: body.action,
          createdAt: now,
          partnerId: auth.partnerId,
          voterAlias: body.voterAlias,
        },
        'attribute_not_exists(incidentId)',
      );
      // The condition above isn't quite right (only checks the PK), so
      // confirm by re-reading with the full key.
      if (!created) {
        const existing = await docClient.send(new GetCommand({
          TableName: TABLES.confirmations,
          Key: { incidentId, deviceId: externalDeviceId },
        }));
        if (existing.Item) {
          return errorResponse(409, 'Voter has already acted on this incident', 'already_verified');
        }
      }

      if (body.action === 'no_longer_exists') {
        await docClient.send(new UpdateCommand({
          TableName: TABLES.incidents,
          Key: { incidentId },
          UpdateExpression: 'SET #s = :r, updatedAt = :now',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':r': 'resolved', ':now': now },
        }));
      } else {
        const isWorsened = body.action === 'worsened';
        const update = isWorsened
          ? 'SET negativeVotes = negativeVotes + :one, updatedAt = :now'
          : 'SET confirmations = confirmations + :one, updatedAt = :now, expiresAt = :exp';
        const values: Record<string, unknown> = isWorsened
          ? { ':one': 1, ':now': now }
          : { ':one': 1, ':now': now, ':exp': now + EXPIRATION_WINDOW_SECONDS };

        await docClient.send(new UpdateCommand({
          TableName: TABLES.incidents,
          Key: { incidentId },
          UpdateExpression: update,
          ExpressionAttributeValues: values,
        }));
      }

      const updated = await getItem<Incident>(TABLES.incidents, { incidentId });
      const conf = computeConfidence(updated?.confirmations ?? 0, updated?.negativeVotes ?? 0);
      return jsonResponse(200, {
        incidentId,
        confirmations: updated?.confirmations ?? 0,
        negativeVotes: updated?.negativeVotes ?? 0,
        confidence: conf.confidence,
        status: updated?.status ?? 'active',
        expiresAt: updated?.expiresAt ?? 0,
      });
    } catch (e) {
      console.error('post-confirmation-v1 error:', e);
      return errorResponse(500, 'Internal error');
    }
  },
  'confirmations:write',
);
