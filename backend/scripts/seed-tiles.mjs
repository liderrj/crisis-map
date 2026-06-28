#!/usr/bin/env node
/**
 * Seed the self-hosted tile bucket with the disaster-zone + critical
 * neighborhood tiles. Reads PNG tiles from a local directory (produced
 * by `generate-tiles.sh` via OpenMapTiles / tilelive-copy) and uploads
 * them to S3 under `tiles/{z}/{x}/{y}.png` using the AWS SDK.
 *
 * Usage:
 *   node backend/scripts/seed-tiles.mjs \
 *     --bucket crisis-map-tiles \
 *     --tiles-dir ./tiles-out \
 *     --concurrency 20
 *
 * Requires AWS credentials in the environment (or AWS_PROFILE) and
 * write access to the bucket.
 */

import { readdir, stat, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { lookup as mimeLookup } from 'node:dns';
import { promisify } from 'node:util';

const args = parseArgs(process.argv.slice(2));
const BUCKET = args.bucket ?? process.env.TILE_BUCKET;
const TILES_DIR = args['tiles-dir'] ?? './tiles-out';
const CONCURRENCY = Number(args.concurrency ?? 20);

if (!BUCKET) {
  console.error('Error: --bucket <name> or TILE_BUCKET env var is required');
  process.exit(1);
}

const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'us-east-1' });

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

async function uploadFile(localPath, relPath) {
  // relPath can look like either:
  //   "altamira/11/523/632.png" (grouped per zone, as produced by
  //     generate-tiles-direct.mjs), or
  //   "11/523/632.png" (flat, as produced by the OpenMapTiles pipeline).
  // In both cases we want the S3 key to be "tiles/{z}/{x}/{y}.png"
  // because the frontend tileUrl template doesn't include a zone
  // prefix. So we drop the first segment if it doesn't look like a
  // zoom level.
  const parts = relPath.split(/[\\/]/);
  const firstLooksLikeZoom = /^\d+$/.test(parts[0]);
  const leaf = firstLooksLikeZoom ? parts : parts.slice(1);
  const key = `tiles/${leaf.join('/')}`;
  const body = await readFile(localPath);
  const contentType = relPath.endsWith('.png') ? 'image/png'
    : relPath.endsWith('.webp') ? 'image/webp'
    : 'application/octet-stream';

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

async function main() {
  console.log(`Bucket:   ${BUCKET}`);
  console.log(`Source:   ${TILES_DIR}`);
  console.log(`Parallel: ${CONCURRENCY}`);

  const allFiles = [];
  for await (const file of walk(TILES_DIR)) {
    if (!file.endsWith('.png') && !file.endsWith('.webp')) continue;
    allFiles.push(file);
  }

  console.log(`Found ${allFiles.length} tiles`);
  if (!allFiles.length) {
    console.error(`No tiles found in ${TILES_DIR}. Did generate-tiles.sh run successfully?`);
    process.exit(1);
  }

  let uploaded = 0;
  let failed = 0;
  const start = Date.now();

  const queue = [...allFiles];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const file = queue.shift();
      if (!file) return;
      try {
        await uploadFile(file, relative(TILES_DIR, file));
        uploaded++;
      } catch (err) {
        failed++;
        console.error(`  ✗ ${file}: ${err.message ?? err.name ?? JSON.stringify(err)}`);
        if (failed === 1) console.error(err);
      }
      if ((uploaded + failed) % 50 === 0) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`  ${uploaded + failed}/${allFiles.length} (${elapsed}s)`);
      }
    }
  });
  await Promise.all(workers);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nDone: ${uploaded} uploaded, ${failed} failed in ${elapsed}s`);

  if (failed) process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val && !val.startsWith('--')) {
        out[key] = val;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});