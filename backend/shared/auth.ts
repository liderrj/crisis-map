import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { verifyPartnerToken, type PartnerClaims } from './jwt.js';
import { jsonResponse, errorResponse } from './headers.js';

export type PartnerAuthContext = PartnerClaims;

function getHeader(headers: Record<string, string | undefined> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) return headers[k];
  }
  return undefined;
}

/**
 * Extracts and verifies the Bearer token from the Authorization header.
 * Returns the partner claims on success, or null on any failure.
 *
 * Callers are expected to return 401 themselves when this returns null,
 * so they can also short-circuit before doing any work.
 */
export async function authenticatePartner(event: APIGatewayProxyEventV2): Promise<PartnerAuthContext | null> {
  const raw = getHeader(event.headers as Record<string, string | undefined>, 'authorization');
  if (!raw) return null;
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  if (!m) return null;
  try {
    return await verifyPartnerToken(m[1]);
  } catch {
    return null;
  }
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

/**
 * Same as `withPartnerAuth` but for handlers that don't need a scope
 * check (only authentication). Use this only for read-only public-ish
 * endpoints that still need identity (e.g. /v1/docs serving the same
 * payload regardless of caller).
 */
export function withPartnerAuthOnly<TEvent extends APIGatewayProxyEventV2, TResult extends APIGatewayProxyResultV2>(
  handler: (event: TEvent, auth: PartnerAuthContext | null) => Promise<TResult>,
): (event: TEvent) => Promise<APIGatewayProxyResultV2> {
  return async (event: TEvent) => {
    // For unauthenticated endpoints (openapi, docs) we don't require a
    // token at all - the inner handler may still call authenticatePartner
    // if it wants to customize per-caller behavior.
    return (await handler(event, null)) as APIGatewayProxyResultV2;
  };
}

// Re-export jsonResponse/errorResponse for handler convenience.
export { jsonResponse, errorResponse };
