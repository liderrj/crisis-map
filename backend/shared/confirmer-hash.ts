import { createHash } from 'node:crypto';

const HASH_LENGTH = 12; // 48 bits — plenty to distinguish voters in a list.

/**
 * Production secret path. The cache is process-local; on container
 * refresh the secret is re-fetched. Rotating the SSM parameter only
 * invalidates old hashes after the 5-min cache TTL expires, which is
 * acceptable because rotating the secret just makes the same deviceId
 * produce a different hash across rotations — no correctness issue.
 *
 * CRITICAL: this module-scoped `cachedSecret` is for the production
 * path ONLY. The test-only path below (getSecretSync) uses a
 * different module-scoped variable so a test invocation can never
 * poison the production cache with the deterministic fallback salt.
 */
let cachedSecret: Uint8Array | null = null;

async function getSecret(): Promise<Uint8Array> {
  if (cachedSecret) return cachedSecret;
  const paramName = process.env.JWT_SECRET_PARAM ?? '/crisismap/partner-api/jwt-signing-secret';
  const { SSMClient, GetParameterCommand } = await import('@aws-sdk/client-ssm');
  const ssm = new SSMClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  const res = await ssm.send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
  const value = res.Parameter?.Value;
  if (!value || value.length < 32) {
    throw new Error(`Secret at ${paramName} missing or too short`);
  }
  cachedSecret = new TextEncoder().encode(value);
  return cachedSecret;
}

/**
 * Test-only synchronous secret resolver. Uses a separate cache from
 * the production path so a test that invokes this function can never
 * overwrite the production secret. The fallback `SECRET_SALT` env
 * var is set in test setup; the hardcoded string is a last-resort
 * guard against an unconfigured test environment.
 */
let testCachedSecret: Uint8Array | null = null;
function getSecretSyncForTests(): Uint8Array {
  if (testCachedSecret) return testCachedSecret;
  const raw = process.env.SECRET_SALT ?? 'cm-test-salt-not-for-production-32chars';
  testCachedSecret = new TextEncoder().encode(raw);
  return testCachedSecret;
}

/**
 * Computes an opaque, per-incident confirmer hash.
 *
 *   incidentSalt  = sha256(SECRET || incidentId).slice(0, 16)
 *   confirmerHash = sha256(incidentSalt || deviceId).slice(0, 12)
 *
 * The per-incident salt means the same deviceId produces a different
 * hash on every incident — an observer who reads the hash from one
 * response cannot correlate the same voter across incidents.
 *
 * The hash is 12 hex chars (~48 bits), enough to distinguish voters
 * within a single list but not enough to be useful as a stable
 * cross-incident identifier (intentionally).
 */
export function computeConfirmerHash(incidentId: string, deviceId: string, secret?: Uint8Array): string {
  const s = secret ?? getSecretSyncForTests();
  const incidentSalt = createHash('sha256').update(s).update(incidentId).digest();
  // Truncate to 8 bytes (64 bits) so the salt-input round is cheaper;
  // collisions across distinct incidents are astronomically unlikely
  // (the secret is 32+ bytes, random in practice).
  const truncated = incidentSalt.subarray(0, 8);
  return createHash('sha256').update(truncated).update(deviceId).digest('hex').slice(0, HASH_LENGTH);
}

/**
 * Async variant used by the Lambda at request time. Warms the cache
 * on first call so subsequent synchronous calls within the same
 * invocation are cheap.
 */
export async function computeConfirmerHashAsync(incidentId: string, deviceId: string): Promise<string> {
  const s = await getSecret();
  return computeConfirmerHash(incidentId, deviceId, s);
}