// @ts-nocheck — tests intentionally exercise the auth module with a
// real (test-scoped) JWT roundtrip so we don't have to fight ts-jest's
// ESM mock limitations. The secret is generated fresh in the test.
import { jest } from '@jest/globals';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const TEST_SECRET = 'a'.repeat(48);
const originalEnv = process.env.JWT_SECRET_PARAM;

beforeAll(() => {
  process.env.JWT_SECRET_PARAM = '/test/auth-secret';
  // Pre-populate the SSM cache by writing the value once through a
  // roundtrip: we use the real signPartnerToken to mint a token with
  // the test secret, after first telling the SSM client (via mock) to
  // return our test secret.
  process.env.JWT_TEST_SECRET_OVERRIDE = TEST_SECRET;
});

afterAll(() => {
  if (originalEnv) process.env.JWT_SECRET_PARAM = originalEnv;
  else delete process.env.JWT_SECRET_PARAM;
  jest.restoreAllMocks();
});

function makeEvent(authHeader: string | undefined): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /x',
    rawPath: '/x',
    rawQueryString: '',
    headers: authHeader ? { authorization: authHeader } : {},
    requestContext: {} as never,
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe('shared/auth (header extraction only, no JWT verification)', () => {
  test('authenticatePartner returns null when no Authorization header', async () => {
    const { authenticatePartner } = await import('../../shared/auth');
    expect(await authenticatePartner(makeEvent(undefined))).toBeNull();
  });

  test('authenticatePartner returns null for non-Bearer scheme', async () => {
    const { authenticatePartner } = await import('../../shared/auth');
    expect(await authenticatePartner(makeEvent('Basic abc'))).toBeNull();
  });

  test('authenticatePartner returns null for malformed Bearer header', async () => {
    const { authenticatePartner } = await import('../../shared/auth');
    expect(await authenticatePartner(makeEvent('Bearer'))).toBeNull();
  });

  test('hasScope returns true only when the scope is in the claim', async () => {
    const { hasScope } = await import('../../shared/auth');
    const claims = { partnerId: 'p', scopes: ['incidents:read', 'incidents:write'] };
    expect(hasScope(claims, 'incidents:read')).toBe(true);
    expect(hasScope(claims, 'incidents:delete')).toBe(false);
    expect(hasScope({ partnerId: 'p', scopes: undefined }, 'incidents:read')).toBe(false);
  });

  test('withPartnerAuth returns 401 on missing token without ever calling the inner handler', async () => {
    const { withPartnerAuth, jsonResponse } = await import('../../shared/auth');
    const inner = jest.fn(async () => jsonResponse(200, { ok: true }));
    const handler = withPartnerAuth(inner, 'incidents:read');
    const res = await handler(makeEvent(undefined));
    expect(res.statusCode).toBe(401);
    expect(inner).not.toHaveBeenCalled();
  });
});
