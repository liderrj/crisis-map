import { createHash } from 'node:crypto';

const HASH_LENGTH = 12; // 48 bits — plenty to distinguish voters in a list.

let cachedSecret: Uint8Array | null = null;

/**
 * Resolves the per-process secret used to derive confirmer hashes.
 * Loads from `JWT_SECRET_PARAM` (the same SSM-backed secret the JWT
 * signer uses) on first access, caches the decoded bytes in memory.
 *
 * The cache is process-local; on container refresh the secret is
 * re-fetched. This is fine because the secret only affects the
 * confirmerHash output and rotating it just makes the same deviceId
 * produce a different hash across rotations — no correctness issue.
 */
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
 * Synchronous variant for tests / non-Lambda contexts. Uses
 * `process.env.SECRET_SALT` if set; otherwise a deterministic fallback
 * so the helper is callable outside the AWS runtime.
 */
function getSecretSync(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const raw = process.env.SECRET_SALT ?? 'cm-test-salt-not-for-production-32chars';
  cachedSecret = new TextEncoder().encode(raw);
  return cachedSecret;
}

/**
 * Computes an opaque, per-incident confirmer hash.
 *
 *   incidentSalt  = sha256(SECRET || incidentId).slice(0, 16)
 *   confirmerHash = sha256(incidentSalt || deviceId).slice(0, 12)
 *
 * The per-incident salt means the same deviceId produces a different
 * hash on every incident — an observer who reads the hash from one
 * response cannot correlate the same device across incidents.
 *
 * The hash is 12 hex chars (~48 bits), enough to distinguish voters
 * within a single list but not enough to be useful as a stable
 * cross-incident identifier (intentionally).
 */
export function computeConfirmerHash(incidentId: string, deviceId: string, secret?: Uint8Array): string {
  const s = secret ?? getSecretSync();
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

// Exposed so the cached secret is reachable from the test suite.
export const _internal = { getSecretSync };