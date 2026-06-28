# Self-Hosted Tiles

The CrisisMap PWA serves OpenStreetMap raster tiles from our own S3 bucket
behind a CloudFront distribution, instead of `*.tile.openstreetmap.org`.
This gives us:

- **No rate limiting** during a crisis (OSM tiles throttle at scale)
- **Predictable storage costs** (we pay S3 + CF, not a flat per-request rate)
- **A reliable offline experience** — the SW caches our CDN the same way it
  would have cached OSM, but the tiles never disappear
- **Independence from OSM uptime** for the disaster zone specifically

## Layout

| Zone | Bbox | Zooms | Tiles |
|------|------|-------|-------|
| Altamira | 10.480–10.520 N / -66.880–-66.850 W | 11–16 | 84 |
| La Guaira capital | 10.600–10.650 N / -66.930–-66.900 W | 11–16 | 116 |
| Disaster zone (regional) | 10.30–10.72 N / -67.05–-66.55 W | 11–13 | 184 |
| **Total** | | | **~384** |

At an average 25 KB per tile (PNG, OSM raster style) that's roughly
**~9.4 MB of tiles**, well within S3 free tier for the seed.

The S3 layout matches the URL pattern Leaflet expects:

```
tiles/{z}/{x}/{y}.png
```

So a request for `tiles/14/5149/7718.png` lands directly on the right
object in S3 via the CloudFront CDN.

## Updating the frontend

`apps/web/src/environments/environment.ts` already points at the self-hosted
CDN (the CloudFront domain is emitted by CDK as the `TileCdnUrl` output).
If you redeploy the stack and CloudFront gives you a new domain, update
`tileUrl` and rebuild.

## Regenerating tiles

The pipeline is one-shot (not part of the runtime). It runs from a
workstation with Docker and ~10 GB of free disk.

### Step 1 — Generate raster tiles locally

```bash
cd backend/scripts
chmod +x generate-tiles.sh
./generate-tiles.sh
```

This:

1. Downloads the latest Venezuela OSM extract from Geofabrik
2. Boots a temporary PostgreSQL container and imports the data with `imposm3`
3. Generates vector tiles (`.mbtiles`) with the OpenMapTiles schema
4. Renders the vector tiles to raster PNGs via `tilelive-mapnik`
5. Crops the output to the per-zone bboxes in `OUT_DIR/tiles-out/<zone>/`

Expected runtime: 30–90 minutes on a modern laptop, mostly idle while
`imposm3` imports the PBF.

### Step 2 — Upload to S3

```bash
node seed-tiles.mjs \
  --bucket crisis-map-tiles \
  --tiles-dir ./tiles-out \
  --concurrency 20
```

This walks the local directory, uploads each `*.png` to S3 under
`tiles/{z}/{x}/{y}.png` with `Cache-Control: public, max-age=31536000,
immutable` (the file path is content-addressed by the upstream tile
generator, so cache busting happens by re-running the pipeline).

Requires AWS credentials (e.g. `AWS_PROFILE=arkem`).

### Step 3 — Verify

```bash
# Pull a sample tile and check it's a valid PNG
curl -sI https://<your-cloudfront-domain>/tiles/14/5149/7718.png \
  | grep -i 'content-type\|x-cache'

# Open the app and check the map loads. Then go offline (DevTools →
  Application → Service Workers → Offline) and pan around Caracas /
  La Guaira at z=15-16 — tiles should already be there from the
  prefetch + the seed.
```

## Adding more zones

1. Add a new entry to `CRITICAL_ZONES` in `apps/web/src/app/shared/constants.ts`.
2. (Optional) Widen `DISASTER_ZONE.bbox` for a bigger regional cache.
3. Re-run the generation pipeline; only the new zones will be uploaded.
4. Bump the `STORAGE_KEY` constant in `TilePrefetchService` (e.g. `v2` → `v3`)
   so existing users re-run the prefetch on next launch.

## Cost

| Resource | Size / rate | Estimated monthly cost |
|----------|-------------|------------------------|
| S3 storage | ~10 MB | < $0.01 |
| CloudFront transfer | depends on usage | ~$0.085/GB |
| EC2 for regen | not running unless regenerating | ~$0 if one-shot |

For a crisis event with a few thousand users refreshing the map, expect
well under $5/month total.

## Attribution

Tiles are derived from OpenStreetMap, so keep the attribution string on
the map (the Leaflet attribution control is preserved with "© OpenStreetMap").
The OpenStreetMap data is © OpenStreetMap contributors and licensed under
ODbL — self-hosting tiles doesn't remove the attribution requirement.