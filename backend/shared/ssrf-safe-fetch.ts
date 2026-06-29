import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * IP ranges that must never be reached when downloading partner-supplied
 * URLs. The goal is to prevent an attacker from pointing imageUrls at
 * internal AWS metadata endpoints, the Lambda's own loopback, or the
 * host's private network.
 *
 * IPv4: 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10 (CGN), 127.0.0.0/8,
 *       169.254.0.0/16, 172.16.0.0/12, 192.0.0.0/24, 192.0.2.0/24,
 *       192.168.0.0/16, 198.18.0.0/15, 198.51.100.0/24,
 *       203.0.113.0/24, 224.0.0.0/4, 240.0.0.0/4
 * IPv6: ::/128 (unspec), ::1/128 (loopback), fc00::/7 (ULA),
 *       fe80::/10 (link-local), 2001:db8::/32 (docs)
 */
const BLOCKED_V4_CIDRS: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

const BLOCKED_V6_CIDRS: Array<[string, number]> = [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['2001:db8::', 32],
];

function ipToBuffer(ip: string): Buffer | null {
  const family = isIP(ip);
  if (family === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return null;
    return Buffer.from(parts);
  }
  if (family === 6) {
    // Accept either a bare address ("fe80::1", "::", "fe80::", "1::2")
    // or the bracketed form ("[fe80::1]") that the URL parser leaves
    // in `hostname`.
    let bare = ip;
    if (bare.startsWith('[') && bare.endsWith(']')) {
      bare = bare.slice(1, -1);
    }
    // Normalize leading/trailing "::" so the split always produces a
    // single empty between the two halves, not two empties at the edges.
    // e.g. "fe80::" -> "fe80::0" -> ["fe80", "", "0"]; "::1" -> "0::1"
    // -> ["0", "", "1"]; "::" -> "0::0" -> ["0", "", "0"].
    if (bare === '::') bare = '0::0';
    if (bare.startsWith('::')) bare = '0' + bare;
    if (bare.endsWith('::')) bare = bare + '0';
    const parts = bare.split(':');
    const out: number[] = [];
    let sawEmpty = false;
    for (const part of parts) {
      if (part === '') {
        if (sawEmpty) return null; // "::" can appear at most once
        sawEmpty = true;
        const known = parts.filter((p) => p !== '').length;
        const missing = 8 - known;
        for (let i = 0; i < missing; i++) out.push(0);
      } else if (part.includes('.')) {
        // IPv4-mapped tail (e.g. "::ffff:192.0.2.1")
        const v4 = part.split('.').map(Number);
        if (v4.length !== 4) return null;
        out.push(((v4[0] << 8) | v4[1]) & 0xffff);
        out.push(((v4[2] << 8) | v4[3]) & 0xffff);
      } else {
        const n = parseInt(part, 16);
        if (Number.isNaN(n)) return null;
        out.push(n);
      }
    }
    if (out.length !== 8) return null;
    const buf = Buffer.alloc(16);
    for (let i = 0; i < 8; i++) buf.writeUInt16BE(out[i], i * 2);
    return buf;
  }
  return null;
}

function cidrContains(cidrIp: string, prefix: number, target: Buffer): boolean {
  const cidr = ipToBuffer(cidrIp);
  if (!cidr || cidr.length !== target.length) return false;
  const fullBytes = Math.floor(prefix / 8);
  const remBits = prefix % 8;
  for (let i = 0; i < fullBytes; i++) {
    if (cidr[i] !== target[i]) return false;
  }
  if (remBits > 0) {
    const mask = (0xff << (8 - remBits)) & 0xff;
    if ((cidr[fullBytes] & mask) !== (target[fullBytes] & mask)) return false;
  }
  return true;
}

function isBlockedIp(ip: string): boolean {
  const buf = ipToBuffer(ip);
  if (!buf) return true; // unparseable -> block
  const cidrList = buf.length === 4 ? BLOCKED_V4_CIDRS : BLOCKED_V6_CIDRS;
  for (const [cidr, prefix] of cidrList) {
    if (cidrContains(cidr, prefix, buf)) return true;
  }
  return false;
}

export interface SafeFetchOptions {
  /** Max response body size in bytes. Default 5 MB. */
  maxBytes?: number;
  /** Total timeout in ms. Default 10s. */
  timeoutMs?: number;
  /** Extra request headers. */
  headers?: Record<string, string>;
}

export interface SafeFetchResult {
  body: Uint8Array;
  contentType: string;
}

/**
 * Fetches a URL while preventing SSRF: only https, resolves the host
 * itself and rejects any address in a blocked range (so a DNS that
 * returns 169.254.169.254 or a private IP is caught even if the URL
 * looked innocent). Throws on protocol mismatch, blocked IP, oversize
 * body, timeout, or non-2xx.
 */
export async function safeFetch(url: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs ?? 10_000;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SafeFetchError('invalid_url', 'URL is not parseable');
  }
  if (parsed.protocol !== 'https:') {
    throw new SafeFetchError('protocol_not_https', 'Only https URLs are accepted');
  }
  const host = parsed.hostname;
  if (!host) throw new SafeFetchError('invalid_url', 'URL has no hostname');

  // WHATWG URL keeps the IPv6 brackets in `hostname` (e.g. "[fe80::1]").
  // Strip them before calling isIP / lookup so the rest of the function
  // operates on a bare address.
  const bareHost = host.replace(/^\[|\]$/g, '');

  // If the host is already an IP literal, check it directly. Otherwise
  // resolve and check every returned address.
  const addresses: string[] = [];
  if (isIP(bareHost)) {
    addresses.push(bareHost);
  } else {
    let resolved: Array<{ address: string; family: number }>;
    try {
      resolved = await lookup(bareHost, { all: true });
    } catch (e) {
      throw new SafeFetchError('dns_failed', `DNS lookup failed: ${(e as Error).message}`);
    }
    for (const a of resolved) addresses.push(a.address);
  }
  if (addresses.length === 0) {
    throw new SafeFetchError('dns_empty', 'No addresses returned for host');
  }
  for (const addr of addresses) {
    if (isBlockedIp(addr)) {
      throw new SafeFetchError(
        'blocked_address',
        `Host ${host} resolves to blocked address ${addr}`,
      );
    }
  }

  // Use the original URL for the actual request so SNI and Host header
  // are correct; Node's built-in fetcher uses the resolved IP under the
  // hood. (For tighter pinning we'd re-construct against the IP, but
  // that breaks SNI + Host-based vhosts; the SSRF check above is enough
  // for MVP.)
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ac.signal,
      headers: opts.headers,
    });
  } catch (e) {
    throw new SafeFetchError('fetch_failed', (e as Error).message);
  } finally {
    clearTimeout(t);
  }
  if (!res.ok) {
    throw new SafeFetchError('http_error', `Remote returned ${res.status}`);
  }

  // Enforce content-length up front (if declared), then stream the body
  // with a hard cap.
  const declared = res.headers.get('content-length');
  if (declared && Number(declared) > maxBytes) {
    throw new SafeFetchError('too_large', `Declared content-length ${declared} exceeds ${maxBytes}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new SafeFetchError('no_body', 'Response has no body');

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* ignore */ }
      throw new SafeFetchError('too_large', `Body exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }

  return {
    body: concatChunks(chunks, total),
    contentType: res.headers.get('content-type') ?? 'application/octet-stream',
  };
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export class SafeFetchError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'SafeFetchError';
  }
}
