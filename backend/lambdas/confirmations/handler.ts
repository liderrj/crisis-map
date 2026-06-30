import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { docClient, TABLES, getItem, putItem } from '../../shared/db.js';
import { QueryCommand, UpdateCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import {
  EXPIRATION_WINDOW_SECONDS,
  isValidIncidentId,
  type ConfirmationAction,
  type Incident,
  type Device,
} from '../../shared/types.js';
import { extractDeviceContext, jsonResponse, errorResponse } from '../../shared/headers.js';
import { shouldResolve, tallyVotes } from '../../shared/confirmation-threshold.js';
import { checkAndIncrement } from '../../shared/rate-limit.js';
import { computeConfirmerHashAsync } from '../../shared/confirmer-hash.js';

const VALID_ACTIONS: ConfirmationAction[] = ['confirm', 'improved', 'worsened', 'no_longer_exists'];
const RATE_LIMIT_PER_MIN = 5;

/** Public response shape for the GET endpoint. No deviceId — the
 *  confirmerHash is per-incident, derived from the deviceId via a
 *  secret-backed salt, so an observer cannot correlate voters across
 *  incidents. */
interface ConfirmationResponse {
  confirmerHash: string;
  alias: string;
  action: ConfirmationAction;
  createdAt: number;
}

interface ConfirmationRow {
  deviceId: string;
  action: ConfirmationAction;
  createdAt: number;
  isDemo?: boolean;
}

/**
 * Writes a structured audit line to a dedicated Log Group so the
 * admin can investigate abuse without sifting through the lambda's
 * normal logs. Failures here are non-fatal (we log the error to
 * stderr as a fallback) — the rate-limiter is the actual defense;
 * this is observability only.
 */
async function audit(event: Record<string, unknown>): Promise<void> {
  try {
    const group = process.env.AUDIT_LOG_GROUP ?? 'CrisisMapConfirmationsAudit';
    const region = process.env.AWS_REGION ?? 'us-east-1';
    const { CloudWatchLogsClient, CreateLogStreamCommand, PutLogEventsCommand } = await import('@aws-sdk/client-cloudwatch-logs');
    const cwl = new CloudWatchLogsClient({ region });
    const streamName = new Date().toISOString().slice(0, 10); // one stream per UTC day
    try {
      await cwl.send(new CreateLogStreamCommand({ logGroupName: group, logStreamName: streamName }));
    } catch {
      // ResourceAlreadyExistsException is the common case on every
      // invocation after the first; ignore.
    }
    await cwl.send(new PutLogEventsCommand({
      logGroupName: group,
      logStreamName: streamName,
      logEvents: [{
        timestamp: Date.now(),
        message: JSON.stringify(event),
      }],
    }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[confirmations-audit] failed to write:', e, 'event:', event);
  }
}

async function handleList(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const incidentId = event.queryStringParameters?.incidentId;
  if (!incidentId || !isValidIncidentId(incidentId)) {
    return errorResponse(400, 'Valid incidentId query parameter is required');
  }
  const qs = event.queryStringParameters ?? {};
  const includeDemo = qs.demo === '1';

  if (!includeDemo) {
    const incident = await getItem<Incident>(TABLES.incidents, { incidentId });
    if (incident?.isDemo === true) {
      return jsonResponse(200, { incidentId, confirmations: [] });
    }
  }

  const query = await docClient.send(new QueryCommand({
    TableName: TABLES.confirmations,
    KeyConditionExpression: 'incidentId = :id',
    ExpressionAttributeValues: { ':id': incidentId },
  }));
  const rows = (query.Items ?? []) as ConfirmationRow[];

  if (rows.length === 0) {
    return jsonResponse(200, { incidentId, confirmations: [] });
  }

  const filtered = includeDemo ? rows : rows.filter((r) => r.isDemo !== true);
  if (filtered.length === 0) {
    return jsonResponse(200, { incidentId, confirmations: [] });
  }

  // Batch-resolve aliases (one round-trip for up to 100 keys).
  const aliases = new Map<string, string>();
  for (let i = 0; i < filtered.length; i += 100) {
    const batch = filtered.slice(i, i + 100).map((r) => r.deviceId);
    const res = await docClient.send(new BatchGetCommand({
      RequestItems: {
        [TABLES.devices]: {
          Keys: batch.map((deviceId) => ({ deviceId })),
          ProjectionExpression: 'deviceId, alias',
        },
      },
    }));
    for (const item of (res.Responses?.[TABLES.devices] ?? []) as Device[]) {
      if (item.alias) aliases.set(item.deviceId, item.alias);
    }
  }

  // Build the response with per-incident confirmer hashes. We never
  // echo the raw deviceId — that's the privacy fix. Hash the rows
  // first (async), then sort and project, so .sort operates on the
  // resolved objects rather than on Promises.
  const hashed = await Promise.all(filtered.map(async (r) => ({
    confirmerHash: await computeConfirmerHashAsync(incidentId, r.deviceId),
    alias: aliases.get(r.deviceId) ?? '',
    action: r.action,
    createdAt: r.createdAt,
  })));
  hashed.sort((a, b) => a.createdAt - b.createdAt);
  const response: ConfirmationResponse[] = hashed;

  return jsonResponse(200, { incidentId, confirmations: response });
}

async function loadAllConfirmationsForIncident(incidentId: string): Promise<ConfirmationRow[]> {
  // We need every confirmation row for the threshold check. The
  // table only allows Query on the PK; that's all we need.
  const out: ConfirmationRow[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await docClient.send(new QueryCommand({
      TableName: TABLES.confirmations,
      KeyConditionExpression: 'incidentId = :id',
      ExpressionAttributeValues: { ':id': incidentId },
      ProjectionExpression: 'deviceId, #a, isDemo',
      ExpressionAttributeNames: { '#a': 'action' },
      ExclusiveStartKey: lastKey,
    }));
    out.push(...((res.Items ?? []) as ConfirmationRow[]));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return out;
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  if (event.requestContext.http.method === 'GET') {
    return handleList(event);
  }

  // POST: write path.
  try {
    let body: { incidentId?: string; action?: string; isDemo?: boolean };
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

    // Rate-limit by deviceId (with IP fallback). The limit applies to
    // every action equally — a malicious actor rotating deviceIds is
    // already slowed down by the act of generating fresh UUIDs, and
    // this further caps total writes per minute per principal.
    const rlKey = device.deviceId || readClientIp(event) || 'anon';
    const rlScope = 'confirmations';
    const rl = await checkAndIncrement(rlScope, rlKey, RATE_LIMIT_PER_MIN);
    if (!rl.allowed) {
      await audit({
        type: 'rate_limited',
        deviceIdHash: device.deviceId ? await computeConfirmerHashAsync(body.incidentId, device.deviceId) : undefined,
        incidentId: body.incidentId,
        action: body.action,
        ip: readClientIp(event),
        resetAt: rl.resetAt,
      });
      return {
        statusCode: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-Content-Type-Options': 'nosniff',
          'Retry-After': `${Math.max(1, rl.resetAt - Math.floor(Date.now() / 1000))}`,
        },
        body: JSON.stringify({
          error: 'Too many confirmation actions; slow down',
          code: 'rate_limited',
          resetAt: rl.resetAt,
        }),
      };
    }

    const action = body.action as ConfirmationAction;
    const incident = await getItem<Incident>(TABLES.incidents, { incidentId: body.incidentId });
    if (!incident) return errorResponse(404, 'Incident not found');

    const isDemo = incident.isDemo === true || body.isDemo === true;
    const now = Math.floor(Date.now() / 1000);

    // Idempotent insert: a single deviceId can only vote once per
    // incident. If they try again, return 409.
    const created = await putItem(
      TABLES.confirmations,
      {
        incidentId: body.incidentId,
        deviceId: device.deviceId,
        action,
        createdAt: now,
        isDemo: isDemo ? true : undefined,
      },
      'attribute_not_exists(incidentId)',
    );
    if (!created) {
      return errorResponse(409, 'This device has already verified this incident', 'already_verified');
    }

    // Best-effort device upsert (keeps the alias lookup healthy).
    await putItem(
      TABLES.devices,
      { deviceId: device.deviceId, alias: device.alias, lastSeen: now },
    );

    // Read the full tally so we can decide whether to flip the
    // status. For `no_longer_exists` we are interested in flipping
    // the status to `resolved` once the threshold is met; for the
    // other actions we just bump the existing counters and skip the
    // threshold logic.
    let tally = { affirming: 1, worsening: 0, distinctDevices: 1 };
    let resolved = false;
    if (action === 'no_longer_exists') {
      const rows = await loadAllConfirmationsForIncident(body.incidentId);
      // Drop demo confirmations from non-demo sessions so a partner
      // sandbox can't accidentally help resolve a real incident (or
      // vice versa).
      const relevant = isDemo ? rows : rows.filter((r) => r.isDemo !== true);
      tally = tallyVotes(relevant);
      if (shouldResolve(relevant)) {
        try {
          await docClient.send(new UpdateCommand({
            TableName: TABLES.incidents,
            Key: { incidentId: body.incidentId },
            UpdateExpression: 'SET #s = :r, updatedAt = :now',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: { ':r': 'resolved', ':now': now },
            // Idempotent: a concurrent request that already flipped
            // the status makes this a no-op (we still return success
            // because the desired state is reached).
            ConditionExpression: '#s = :active',
          }));
          resolved = true;
          await audit({
            type: 'resolved_by_threshold',
            incidentId: body.incidentId,
            tally,
            action,
          });
        } catch (e: unknown) {
          const err = e as { name?: string };
          if (err.name !== 'ConditionalCheckFailedException') throw e;
          // Someone else flipped it concurrently — treat as success.
          resolved = true;
        }
      } else {
        await audit({
          type: 'resolve_attempt_below_threshold',
          incidentId: body.incidentId,
          deviceIdHash: await computeConfirmerHashAsync(body.incidentId, device.deviceId),
          action,
          tally,
        });
      }
    }

    // For `confirm` / `improved` / `worsened` we update the existing
    // counters (no threshold logic; these votes increase confidence
    // or mark severity changes, neither hides the incident).
    if (action !== 'no_longer_exists') {
      const isWorsened = action === 'worsened';
      const update = isWorsened
        ? 'SET negativeVotes = negativeVotes + :one, updatedAt = :now'
        : 'SET confirmations = confirmations + :one, updatedAt = :now, expiresAt = :exp';
      const values: Record<string, unknown> = isWorsened
        ? { ':one': 1, ':now': now }
        : { ':one': 1, ':now': now, ':exp': now + EXPIRATION_WINDOW_SECONDS };
      await docClient.send(new UpdateCommand({
        TableName: TABLES.incidents,
        Key: { incidentId: body.incidentId },
        UpdateExpression: update,
        ExpressionAttributeValues: values,
      }));
    }

    // Build a response that mirrors the legacy shape for backwards
    // compatibility with the citizen client, plus new fields so the
    // client can tell whether the hide threshold has been met.
    const updated = action !== 'no_longer_exists'
      ? await getItem<Incident>(TABLES.incidents, { incidentId: body.incidentId })
      : incident;
    const confirmations = updated?.confirmations ?? incident.confirmations;
    const negativeVotes = updated?.negativeVotes ?? incident.negativeVotes;
    return jsonResponse(200, {
      incidentId: body.incidentId,
      confirmations,
      negativeVotes,
      confidence: Math.max(0, confirmations - negativeVotes),
      status: resolved ? 'resolved' : (updated?.status ?? 'active'),
      expiresAt: updated?.expiresAt ?? 0,
      // Only present when the action was `no_longer_exists`:
      resolved_pending: action === 'no_longer_exists' && !resolved,
      ...(action === 'no_longer_exists' ? { tally } : {}),
    });
  } catch (err) {
    console.error('Confirmations error:', err);
    return errorResponse(500, 'Internal error');
  }
};

function readClientIp(event: APIGatewayProxyEventV2): string | undefined {
  const h = event.headers as Record<string, string | undefined>;
  const xff = h['x-forwarded-for'] ?? h['X-Forwarded-For'];
  if (xff) return xff.split(',')[0]?.trim();
  return undefined;
}