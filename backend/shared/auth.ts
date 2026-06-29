import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, TABLES } from './db.js';
import { verifyPartnerToken, type PartnerClaims } from './jwt.js';
import { jsonResponse, errorResponse } from './headers.js';

/**
 * Per-client configuration loaded from the OAuthClientsTable. Carried
 * through the auth pipeline so handlers can branch on flags like
 * `sandbox` without making a second round-trip to DDB.
 */
export interface PartnerClientRecord {
  clientId: string;
  partnerId: string;
  scopes: string[];
  enabled: boolean;
  /**
   * When true, all writes are forced into the demo bucket (incidents
   * are tagged isDemo=true, hidden from non-demo sessions) and all
   * reads are filtered to the partner's own demo data. Used for
   * onboarding new partners who need to exercise the API end-to-end
   * without polluting the production incident dataset.
   */
  sandbox: boolean;
}

export type PartnerAuthContext = PartnerClaims & {
  /** The row from OAuthClientsTable for the calling client. */
  client: PartnerClientRecord;
};

function getHeader(headers: Record<string, string | undefined> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) return headers[k];
  }
  return undefined;
}

/**
 * Verifies the Bearer token, then loads the matching OAuthClientsTable
 * row to attach per-client config (sandbox flag, enabled, scopes) to
 * the auth context. Returns null on any failure.
 */
export async function authenticatePartner(event: APIGatewayProxyEventV2): Promise<PartnerAuthContext | null> {
  const raw = getHeader(event.headers as Record<string, string | undefined>, 'authorization');
  if (!raw) return null;
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (!m) return null;

  let claims: PartnerClaims;
  try {
    claims = await verifyPartnerToken(m[1]);
  } catch {
    return null;
  }

  const res = await docClient.send(new GetCommand({
    TableName: TABLES.oauthClients,
    Key: { clientId: claims.sub },
  }));
  const client = res.Item as PartnerClientRecord | undefined;
  if (!client || !client.enabled) return null;

  return { ...claims, client };
}

export function hasScope(claims: PartnerAuthContext, scope: string): boolean {
  return Array.isArray(claims.scopes) && claims.scopes.includes(scope);
}

/**
 * Wraps a handler with bearer-token auth + a required scope. On failure,
 * emits 401 (no token / bad token) or 403 (insufficient scope) without
 * ever invoking the inner handler.
 */
export function withPartnerAuth<TEvent extends APIGatewayProxyEventV2, TResult extends APIGatewayProxyResultV2>(
  handler: (event: TEvent, auth: PartnerAuthContext) => Promise<TResult>,
  requiredScope: string,
): (event: TEvent) => Promise<APIGatewayProxyResultV2> {
  return async (event: TEvent) => {
    const auth = await authenticatePartner(event);
    if (!auth) return errorResponse(401, 'Invalid or missing bearer token', 'unauthorized');
    if (!hasScope(auth, requiredScope)) {
      return errorResponse(403, `Token does not include required scope: ${requiredScope}`, 'insufficient_scope');
    }
    return (await handler(event, auth)) as APIGatewayProxyResultV2;
  };
}

// Re-export jsonResponse/errorResponse for handler convenience.
export { jsonResponse, errorResponse };
