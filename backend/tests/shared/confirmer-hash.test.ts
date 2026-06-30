// @ts-nocheck — uses lazy require to control the cached secret in
// confirmer-hash.ts so tests are deterministic and offline.
import { computeConfirmerHash } from '../../shared/confirmer-hash';

const TEST_SECRET = new TextEncoder().encode('test-secret-32-chars-minimum-length-ok');

describe('shared/confirmer-hash', () => {
  test('same (incidentId, deviceId, secret) → same hash (deterministic)', () => {
    const a = computeConfirmerHash('inc-1', 'dev-1', TEST_SECRET);
    const b = computeConfirmerHash('inc-1', 'dev-1', TEST_SECRET);
    expect(a).toBe(b);
  });

  test('same deviceId, different incidentId → different hash (no correlation across incidents)', () => {
    const a = computeConfirmerHash('inc-1', 'dev-1', TEST_SECRET);
    const b = computeConfirmerHash('inc-2', 'dev-1', TEST_SECRET);
    expect(a).not.toBe(b);
  });

  test('different deviceId, same incidentId → different hash (within-list distinct)', () => {
    const a = computeConfirmerHash('inc-1', 'dev-1', TEST_SECRET);
    const b = computeConfirmerHash('inc-1', 'dev-2', TEST_SECRET);
    expect(a).not.toBe(b);
  });

  test('hash is 12 hex chars (48 bits)', () => {
    const h = computeConfirmerHash('inc-1', 'dev-1', TEST_SECRET);
    expect(h).toMatch(/^[0-9a-f]{12}$/);
  });

  test('different secrets produce different hashes for the same input', () => {
    const secretA = new TextEncoder().encode('secret-A-32-chars-padding-padding');
    const secretB = new TextEncoder().encode('secret-B-32-chars-padding-padding');
    const a = computeConfirmerHash('inc-1', 'dev-1', secretA);
    const b = computeConfirmerHash('inc-1', 'dev-1', secretB);
    expect(a).not.toBe(b);
  });
});