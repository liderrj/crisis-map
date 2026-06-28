#!/usr/bin/env node
/**
 * Generate raster tiles by downloading them from OpenStreetMap
 * directly into the directory layout that seed-tiles.mjs expects
 * (altamira/{z}/{x}/{y}.png, laguaira/..., disaster/...).
 *
 * This is the seed path used in an emergency. The pipeline using
 * OpenMapTiles + tilelive (generate-tiles.sh) is the production-grade
 * path but requires Docker + 10 GB + 30-90 minutes of CPU time. We
 * ship both so contributors can pick their preferred toolchain.
 *
 * Usage:
 *   node backend/scripts/generate-tiles-direct.mjs
 *     [--out ./tiles-out]
 *     [--concurrency 8]
 *
 * Bboxes / zooms are duplicated from apps/web/src/app/shared/constants.ts
 * (CRITICAL_ZONES + DISASTER_ZONE) so the output matches what the
 * frontend will request. Keep them in sync if you change one.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const args = parseArgs(process.argv.slice(2));
const OUT_DIR = args.out ?? './tiles-out';
const CONCURRENCY = Number(args.concurrency ?? 8);

const OSM_SUBDOMAINS = ['a', 'b', 'c'];

const ZONES = [
  {
    name: 'altamira',
    bbox: { minLat: 10.480, maxLat: 10.520, minLng: -66.880, maxLng: -66.850 },
    zooms: [11, 12, 13, 14, 15, 16],
  },
  {
    name: 'laguaira',
    bbox: { minLat: 10.600, maxLat: 10.650, minLng: -66.930, maxLng: -66.900 },
    zooms: [11, 12, 13, 14, 15, 16],
  },
  {
    name: 'disaster',
    bbox: { minLat: 10.300, maxLat: 10.720, minLng: -67.050, maxLng: -66.550 },
    zooms: [11, 12, 13],
  },
];

function lngToTileX(lng, z) {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, z));
}

function latToTileY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, z),
  );
}

function buildTileList(zone) {
  const { minLat, maxLat, minLng, maxLng } = zone.bbox;
  const tiles = [];
  for (const z of zone.zooms) {
    const xMin = lngToTileX(minLng, z);
    const xMax = lngToTileX(maxLng, z);
    const yMin = latToTileY(maxLat, z);
    const yMax = latToTileY(minLat, z);
    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

function tileUrl(z, x, y) {
  const sub = OSM_SUBDOMAINS[(x + y + z) % OSM_SUBDOMAINS.length];
  return `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

async function fetchWithRetry(url, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'CrisisMap-TileSeeder/1.0 (arkemdigital@gmail.com)',
        },
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      if (res.status === 404) return null; // empty tile (ocean, etc.)
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  return null;
}

async function worker(queue, stats) {
  while (queue.length) {
    const item = queue.shift();
    if (!item) return;
    const { zone, tile, outPath } = item;
    const url = tileUrl(tile.z, tile.x, tile.y);
    try {
      const buf = await fetchWithRetry(url);
      if (buf === null) {
        stats.empty++;
      } else {
        await mkdir(join(outPath, '..'), { recursive: true });
        await writeFile(outPath, buf);
        stats.ok++;
      }
    } catch (err) {
      stats.failed++;
    }
  }
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

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const queue = [];
  let totalTiles = 0;
  const stats = { ok: 0, empty: 0, failed: 0 };

  for (const zone of ZONES) {
    const tiles = buildTileList(zone);
    totalTiles += tiles.length;
    const zoneDir = join(OUT_DIR, zone.name);
    await mkdir(zoneDir, { recursive: true });
    for (const tile of tiles) {
      queue.push({
        zone: zone.name,
        tile,
        outPath: join(zoneDir, String(tile.z), String(tile.x), `${tile.y}.png`),
      });
    }
    console.log(`  ${zone.name}: ${tiles.length} tiles (z=${zone.zooms.join(',')})`);
  }

  console.log(`\nTotal: ${totalTiles} tiles`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log(`Output: ${OUT_DIR}\n`);

  const start = Date.now();
  const workers = Array.from({ length: CONCURRENCY }, () => worker(queue, stats));
  await Promise.all(workers);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\nDone in ${elapsed}s`);
  console.log(`  ok:    ${stats.ok}`);
  console.log(`  empty: ${stats.empty}`);
  console.log(`  failed: ${stats.failed}`);
  if (stats.failed) {
    console.error(`\n${stats.failed} tiles failed. Re-run the script to retry.`);
    process.exit(1);
  }
  console.log(`\nNext: node backend/scripts/seed-tiles.mjs --bucket <name> --tiles-dir ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});