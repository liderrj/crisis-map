#!/usr/bin/env bash
#
# Generate raster tiles for the CrisisMap disaster zone + critical
# neighborhoods using OpenMapTiles + tilelive + OpenStreetMap data.
#
# Pipeline:
#   1. Download a Geofabrik OSM extract for Venezuela (or a smaller
#      regional extract).
#   2. Import into PostgreSQL with imposm3.
#   3. Generate vector tiles with tilelive-copy (OpenMapTiles schema).
#   4. Render vector tiles to raster PNG with tilelive-mapnik.
#   5. Crop to the bbox of each critical zone.
#   6. Hand off to seed-tiles.mjs which uploads to S3.
#
# This is a one-shot script run from a workstation (not part of the
# runtime pipeline). Total runtime: ~30-90 minutes on a modern laptop
# with Docker; mostly idle while imposm3 imports the data.
#
# Requirements: docker, ~10 GB free disk, internet access to
# download.geofabrik.de.

set -euo pipefail

OUT_DIR="${OUT_DIR:-./tiles-out}"
EXTRACT_URL="${EXTRACT_URL:-https://download.geofabrik.de/south-america/venezuela-latest.osm.pbf}"
EXTRACT_FILE="${EXTRACT_FILE:-venezuela-latest.osm.pbf}"
BBOX_ALTAMIRA="${BBOX_ALTAMIRA:-10.480,10.520,-66.880,-66.850}"
BBOX_LAGUAIRA="${BBOX_LAGUAIRA:-10.600,10.650,-66.930,-66.900}"
BBOX_DISASTER="${BBOX_DISASTER:-10.300,10.720,-67.050,-66.550}"
ZOOMS_CRITICAL="${ZOOMS_CRITICAL:-11-16}"
ZOOMS_DISASTER="${ZOOMS_DISASTER:-11-13}"

echo "==> Output directory: $OUT_DIR"
mkdir -p "$OUT_DIR"

if [ ! -f "$EXTRACT_FILE" ]; then
  echo "==> Downloading Venezuela OSM extract..."
  curl -L -o "$EXTRACT_FILE" "$EXTRACT_URL"
fi

echo "==> Starting PostgreSQL + imposm3 in Docker..."
docker run -d --rm --name crisismap-tiles \
  -v "$PWD:/work" -w /work \
  -p 5432:5432 \
  -e POSTGRES_PASSWORD=tiles \
  maptiler/tileserver-gl:latest \
  || true
trap 'docker rm -f crisismap-tiles >/dev/null 2>&1 || true' EXIT

echo "==> Waiting for PostgreSQL..."
until docker exec crisismap-tiles pg_isready -U postgres; do sleep 1; done

echo "==> Importing with imposm3..."
docker run --rm --network host -v "$PWD:/work" -w /work \
  geoffboeing/imposm3:latest \
  imposm3 import \
    -connection "postgis://postgres:tiles@localhost:5432/postgres" \
    -mapping /work/tiles-mapping.yml \
    -read "$EXTRACT_FILE" \
    -write \
    -deployproduction \
    -optimize \
    -overwritecache \
    -diff

echo "==> Generating vector tiles (OpenMapTiles schema)..."
docker run --rm --network host -v "$PWD:/work" -w /work \
  maptiler/tileserver-gl:latest \
  tilelive-copy \
    "openmaptiles://https://api.maptiler.com/tiles/v3/openmaptiles.json?key=${{MAPTILER_KEY:-REPLACE_WITH_YOUR_KEY}}" \
    "mbtiles:///work/tiles-raw.mbtiles" \
    --minzoom 10 --maxzoom 16

echo "==> Rendering vector tiles to raster PNG..."
docker run --rm --network host -v "$PWD:/work" -w /work \
  maptiler/tileserver-gl:latest \
  tilelive-copy \
    "mbtiles:///work/tiles-raw.mbtiles" \
    "file:///work/tiles-rendered" \
    --minzoom 10 --maxzoom 16 \
    --format png

echo "==> Cropping to zone bboxes..."
node -e '
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const tilelive = require("tilelive");
require("tilelive-mapnik").register();
require("mbtiles").register();

const OUT = process.env.OUT_DIR || "./tiles-out";

const zones = [
  { name: "altamira", bbox: process.env.BBOX_ALTAMIRA.split(",").map(Number), zooms: process.env.ZOOMS_CRITICAL },
  { name: "laguaira", bbox: process.env.BBOX_LAGUAIRA.split(",").map(Number), zooms: process.env.ZOOMS_CRITICAL },
  { name: "disaster", bbox: process.env.BBOX_DISASTER.split(",").map(Number), zooms: process.env.ZOOMS_DISASTER },
];

function lngToTileX(lng, z) { return Math.floor(((lng + 180) / 360) * Math.pow(2, z)); }
function latToTileY(lat, z) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z));
}

async function main() {
  for (const zone of zones) {
    const [minLat, maxLat, minLng, maxLng] = zone.bbox;
    const [minZ, maxZ] = zone.zooms.split("-").map(Number);
    const out = path.join(OUT, zone.name);
    fs.mkdirSync(out, { recursive: true });

    let copied = 0;
    for (let z = minZ; z <= maxZ; z++) {
      const xMin = lngToTileX(minLng, z);
      const xMax = lngToTileX(maxLng, z);
      const yMin = latToTileY(maxLat, z);
      const yMax = latToTileY(minLat, z);

      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          const dst = path.join(out, String(z), String(x), `${y}.png`);
          fs.mkdirSync(path.dirname(dst), { recursive: true });
          try {
            const src = `mbtiles:///work/tiles-raw.mbtiles#${z}/${x}/${y}`;
            const dstUri = `file://${dst}`;
            await new Promise((resolve, reject) => {
              tilelive.copy(src, dstUri, (err) => err ? reject(err) : resolve());
            });
            copied++;
          } catch (e) {
            console.warn(`  skip ${z}/${x}/${y}: ${e.message}`);
          }
        }
      }
    }
    console.log(`  ${zone.name}: ${copied} tiles`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
' || true

echo ""
echo "==> Tiles ready in $OUT_DIR"
echo "==> Next: node backend/scripts/seed-tiles.mjs --bucket <name> --tiles-dir $OUT_DIR"