import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { safeFetch, SafeFetchError } from './ssrf-safe-fetch.js';

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });

export interface RehostedImage {
  /** Original URL the partner provided. */
  sourceUrl: string;
  /** S3 object key inside the image bucket. */
  key: string;
  /** Public CDN URL for the rehosted file. */
  cdnUrl: string;
  /** Detected (or supplied) content-type. */
  contentType: string;
  /** Body size in bytes. */
  size: number;
}

export interface RehostOptions {
  /** S3 prefix under the image bucket. Default "external". */
  prefix?: string;
  /** Max body size in bytes. Default 5 MB. */
  maxBytes?: number;
  /** Per-image timeout in ms. Default 10s. */
  timeoutMs?: number;
}

const BUCKET = process.env.IMAGE_BUCKET ?? '';
const CDN_BASE = (process.env.IMAGE_CDN_URL ?? '').replace(/\/$/, '');

/**
 * Downloads a partner-supplied URL (with SSRF protection) and uploads
 * the body to the project's image S3 bucket, returning the CDN URL.
 *
 * Failures are non-fatal at the caller: if one image fails, the others
 * still proceed. Each call returns either a RehostedImage or an error
 * code; the caller decides whether to fail the whole request.
 */
export async function rehostImage(
  sourceUrl: string,
  incidentId: string,
  index: number,
  opts: RehostOptions = {},
): Promise<{ ok: true; image: RehostedImage } | { ok: false; code: string; message: string }> {
  if (!BUCKET || !CDN_BASE) {
    return { ok: false, code: 'config_error', message: 'IMAGE_BUCKET / IMAGE_CDN_URL not configured' };
  }

  let fetched;
  try {
    fetched = await safeFetch(sourceUrl, {
      maxBytes: opts.maxBytes ?? 5 * 1024 * 1024,
      timeoutMs: opts.timeoutMs ?? 10_000,
    });
  } catch (e) {
    if (e instanceof SafeFetchError) {
      return { ok: false, code: e.code, message: e.message };
    }
    return { ok: false, code: 'fetch_failed', message: (e as Error).message };
  }

  // Only accept obvious image content-types. Reject anything else to
  // avoid hosting arbitrary content on our CDN.
  const ct = (fetched.contentType.split(';')[0] ?? '').trim().toLowerCase();
  if (!ct.startsWith('image/')) {
    return { ok: false, code: 'not_image', message: `Refusing non-image content-type: ${ct}` };
  }
  const ext = extensionForContentType(ct);
  const prefix = opts.prefix ?? 'external';
  const key = `${prefix}/${incidentId}/${index}${ext}`;

  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fetched.body,
      ContentType: ct,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
  } catch (e) {
    return { ok: false, code: 's3_put_failed', message: (e as Error).message };
  }

  return {
    ok: true,
    image: {
      sourceUrl,
      key,
      cdnUrl: `${CDN_BASE}/${key}`,
      contentType: ct,
      size: fetched.body.byteLength,
    },
  };
}

function extensionForContentType(ct: string): string {
  switch (ct) {
    case 'image/jpeg': return '.jpg';
    case 'image/png': return '.png';
    case 'image/webp': return '.webp';
    case 'image/gif': return '.gif';
    case 'image/avif': return '.avif';
    case 'image/heic': return '.heic';
    case 'image/heif': return '.heif';
    default: return '.bin';
  }
}
