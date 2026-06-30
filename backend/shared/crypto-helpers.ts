import { createHash, randomBytes } from 'node:crypto';

/**
 * Pure crypto helpers used by the JWT and confirmer-hash modules.
 *
 * Kept dependency-free so unit tests can import this without pulling
 * the ESM-only `jose` package (which confuses ts-jest's CJS path).
 */

/** SHA-256 hex digest of an input string. */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/** 64-char hex random string (256 bits of entropy). */
export function generateSecret(byteLength = 32): string {
  return randomBytes(byteLength).toString('hex');
}