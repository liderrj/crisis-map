import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { createHash, randomBytes } from 'node:crypto';

const ISSUER = 'crisismap';
const AUDIENCE = 'partner-api-v1';
const TOKEN_TTL_SEC = 3600; // 1h
const SECRET_TTL_MS = 5 * 60 * 1000; // refresh the in-memory cache every 5 min

export interface PartnerClaims extends JWTPayload {
  /** OAuth client_id of the calling partner. */
  sub: string;
  /** Stable partner identifier (e.g. "bomberos-caracas"). */
  partnerId: string;
  /** Scopes granted to this token (sub-set of the client's allowed scopes). */
  scopes: string[];
}

// SSM client. We instantiate it once per Lambda container; subsequent
// reads come from the in-memory cache so we don't pay the SSM RTT on
// every JWT operation.
const ssm = new SSMClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
let cachedSecret: { value: Uint8Array; expiresAt: number } | null = null;

async function loadSecret(): Promise<Uint8Array> {
  const now = Date.now();
  if (cachedSecret && cachedSecret.expiresAt > now) return cachedSecret.value;

  const paramName = process.env.JWT_SECRET_PARAM ?? '/crisismap/partner-api/jwt-signing-secret';
  const res = await ssm.send(new GetParameterCommand({
    Name: paramName,
    WithDecryption: true,
  }));
  const value = res.Parameter?.Value;
  if (!value || value.length < 32) {
    throw new Error(`JWT secret at ${paramName} is missing or too short (need >=32 chars)`);
  }
  cachedSecret = { value: new TextEncoder().encode(value), expiresAt: now + SECRET_TTL_MS };
  return cachedSecret.value;
}

/**
 * Signs a new partner JWT with HS256. TTL is 1h.
 * `requestedScopes` is filtered against `allowedScopes` so a client can
 * never get a scope it was not provisioned with.
 */
export async function signPartnerToken(
  clientId: string,
  partnerId: string,
  allowedScopes: string[],
  requestedScopes: string[] | undefined,
): Promise<{ token: string; expiresIn: number; scope: string }> {
  const granted = requestedScopes && requestedScopes.length
    ? requestedScopes.filter((s) => allowedScopes.includes(s))
    : allowedScopes;

  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ partnerId, scopes: granted })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(clientId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + TOKEN_TTL_SEC)
    .sign(await loadSecret());

  return { token, expiresIn: TOKEN_TTL_SEC, scope: granted.join(' ') };
}

/**
 * Verifies a partner JWT and returns the claims. Throws on any failure
 * (expired, bad signature, wrong issuer/audience, etc.).
 */
export async function verifyPartnerToken(token: string): Promise<PartnerClaims> {
  const { payload } = await jwtVerify(token, await loadSecret(), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  // jose returns the payload as JWTPayload; we trust the shape because we
  // set these fields ourselves in signPartnerToken().
  return payload as PartnerClaims;
}

/** SHA-256 hash of a secret, hex-encoded. Used for client_secret storage. */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** Cryptographically random secret. 32 bytes -> 64 hex chars. */
export function generateSecret(byteLength = 32): string {
  return randomBytes(byteLength).toString('hex');
}
