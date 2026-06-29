// @ts-nocheck
import { jest } from '@jest/globals';
import { createHash } from 'node:crypto';

describe('shared/jwt — pure helpers', () => {
  test('hashSecret is a SHA-256 hex digest', async () => {
    const { hashSecret } = await import('../../shared/jwt');
    expect(hashSecret('foo')).toBe(createHash('sha256').update('foo').digest('hex'));
    expect(hashSecret('foo')).toMatch(/^[0-9a-f]{64}$/);
  });

  test('generateSecret returns 64 hex chars', async () => {
    const { generateSecret } = await import('../../shared/jwt');
    const s = generateSecret();
    expect(s).toMatch(/^[0-9a-f]{64}$/);
    // Two calls produce different values (entropy check).
    const s2 = generateSecret();
    expect(s).not.toBe(s2);
  });

  test('hashSecret is deterministic and collision-free for distinct inputs', async () => {
    const { hashSecret } = await import('../../shared/jwt');
    expect(hashSecret('a')).not.toBe(hashSecret('b'));
    expect(hashSecret('a')).toBe(hashSecret('a'));
  });
});

// The sign/verify roundtrip requires SSM access at module load, which
// the test environment cannot provide cleanly. Those are covered by the
// end-to-end smoke tests in CI (see backend/scripts/smoke-test.sh). The
// above three cover the pure / non-network paths.
