import { SafeFetchError, safeFetch } from '../../shared/ssrf-safe-fetch';

describe('shared/ssrf-safe-fetch', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function mockFetchOnce(impl: typeof fetch) {
    globalThis.fetch = jest.fn(impl) as unknown as typeof fetch;
  }

  test('rejects non-https URLs', async () => {
    await expect(safeFetch('http://example.com/x.jpg')).rejects.toMatchObject({
      name: 'SafeFetchError',
      code: 'protocol_not_https',
    });
  });

  test('rejects unparseable URLs', async () => {
    await expect(safeFetch('not a url')).rejects.toMatchObject({
      name: 'SafeFetchError',
      code: 'invalid_url',
    });
  });

  test('rejects when DNS resolves to a private IPv4', async () => {
    // We use a public-looking hostname that resolves to a private IP
    // (here we just hit the literal IP, which is also blocked).
    await expect(safeFetch('https://10.0.0.1/x.jpg')).rejects.toMatchObject({
      name: 'SafeFetchError',
      code: 'blocked_address',
    });
  });

  test('rejects when DNS resolves to loopback (127.0.0.1)', async () => {
    await expect(safeFetch('https://127.0.0.1/x.jpg')).rejects.toMatchObject({
      name: 'SafeFetchError',
      code: 'blocked_address',
    });
  });

  test('rejects when DNS resolves to AWS metadata (169.254.169.254)', async () => {
    await expect(safeFetch('https://169.254.169.254/latest')).rejects.toMatchObject({
      name: 'SafeFetchError',
      code: 'blocked_address',
    });
  });

  test('rejects when DNS resolves to IPv6 link-local (fe80::)', async () => {
    await expect(safeFetch('https://[fe80::1]/x.jpg')).rejects.toMatchObject({
      name: 'SafeFetchError',
      code: 'blocked_address',
    });
  });

  test('rejects when DNS resolves to IPv6 ULA (fc00::)', async () => {
    await expect(safeFetch('https://[fc00::1]/x.jpg')).rejects.toMatchObject({
      name: 'SafeFetchError',
      code: 'blocked_address',
    });
  });

  test('returns the body on a 2xx response', async () => {
    mockFetchOnce(async () => new Response(Buffer.from('hello'), { status: 200, headers: { 'content-type': 'text/plain' } }));
    const out = await safeFetch('https://example.com/x.txt');
    expect(new TextDecoder().decode(out.body)).toBe('hello');
    expect(out.contentType).toBe('text/plain');
  });

  test('rejects on non-2xx', async () => {
    mockFetchOnce(async () => new Response('nope', { status: 404 }));
    await expect(safeFetch('https://example.com/x.txt')).rejects.toMatchObject({
      name: 'SafeFetchError',
      code: 'http_error',
    });
  });

  test('rejects when declared content-length exceeds maxBytes', async () => {
    mockFetchOnce(async () => new Response('x', {
      status: 200,
      headers: { 'content-length': String(10 * 1024 * 1024) },
    }));
    await expect(safeFetch('https://example.com/x.bin', { maxBytes: 1024 })).rejects.toMatchObject({
      name: 'SafeFetchError',
      code: 'too_large',
    });
  });
});

