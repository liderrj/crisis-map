import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLES } from '../../shared/db.js';
import { jsonResponse, errorResponse } from '../../shared/headers.js';
import { hashSecret, signPartnerToken } from '../../shared/jwt.js';

interface OAuthClientRecord {
  clientId: string;
  clientSecretHash: string;
  partnerId: string;
  name: string;
  scopes: string[];
  enabled: boolean;
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  try {
    // Accept both application/x-www-form-urlencoded (per RFC 6749) and
    // application/json (handy for clients that prefer it).
    const body = parseBody(event);
    const grantType = body.grant_type;
    const clientId = body.client_id ?? body.clientId;
    const clientSecret = body.client_secret ?? body.clientSecret;
    const requestedScope = body.scope;

    if (grantType !== 'client_credentials') {
      return errorResponse(400, 'Only grant_type=client_credentials is supported', 'unsupported_grant_type');
    }
    if (!clientId || !clientSecret) {
      return errorResponse(400, 'client_id and client_secret are required', 'invalid_request');
    }

    const res = await docClient.send(new GetCommand({
      TableName: TABLES.oauthClients,
      Key: { clientId },
    }));
    const client = res.Item as OAuthClientRecord | undefined;
    if (!client || !client.enabled) {
      return errorResponse(401, 'Invalid client credentials', 'invalid_client');
    }
    if (hashSecret(clientSecret) !== client.clientSecretHash) {
      return errorResponse(401, 'Invalid client credentials', 'invalid_client');
    }

    const requested = typeof requestedScope === 'string' && requestedScope.length
      ? requestedScope.split(/\s+/).filter(Boolean)
      : undefined;

    const { token, expiresIn, scope } = await signPartnerToken(
      client.clientId,
      client.partnerId,
      client.scopes,
      requested,
    );

    return jsonResponse(200, {
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresIn,
      scope,
    });
  } catch (err) {
    console.error('OAuth token error:', err);
    return errorResponse(500, 'Internal error');
  }
};

type ParsedBody = Record<string, string>;

function parseBody(event: APIGatewayProxyEventV2): ParsedBody {
  const out: ParsedBody = {};
  // API Gateway HTTP API v2 delivers the body base64-encoded when the
  // content-type is not application/json. The flag is in `isBase64Encoded`.
  let raw = event.body ?? '';
  if (event.isBase64Encoded && raw) {
    try {
      raw = Buffer.from(raw, 'base64').toString('utf8');
    } catch { /* fall through; we'll just fail JSON.parse below */ }
  }
  if (!raw) return out;
  const ct = (event.headers['content-type'] ?? event.headers['Content-Type'] ?? '').toLowerCase();
  if (ct.includes('application/json')) {
    try {
      const j = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(j)) {
        if (typeof v === 'string') out[k] = v;
        else if (v != null) out[k] = String(v);
      }
    } catch { /* leave empty */ }
    return out;
  }
  // form-urlencoded
  for (const part of raw.split('&')) {
    const [k, v] = part.split('=');
    if (k) out[decodeURIComponent(k)] = v == null ? '' : decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}
