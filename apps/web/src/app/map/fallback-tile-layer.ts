// OSM subdomains used when we fall back. The self-hosted CDN is the
// primary source (zero rate limit, offline-cacheable); OSM is the
// graceful fallback for tiles we haven't seeded yet so the user
// never sees a gray map.
const OSM_FALLBACK_SUBDOMAINS = ['a', 'b', 'c'] as const;

export function osmFallbackUrl(z: number, x: number, y: number): string {
  const sub = OSM_FALLBACK_SUBDOMAINS[(x + y + z) % OSM_FALLBACK_SUBDOMAINS.length];
  return `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Tile layer that tries the self-hosted CloudFront CDN first and falls
 * back to OSM when the CDN returns 403 / 404 (tile not seeded).
 *
 * Without this fallback the user sees gray tiles any time Leaflet
 * requests a coordinate we haven't uploaded to S3 yet — which is
 * almost everywhere outside the seeded critical zones.
 *
 * Note: tiles served via OSM fallback won't be in the Service Worker
 * cache (no-cors + different domain), so they don't help offline. They
 * exist purely to avoid gray squares during normal use.
 */
export class FallbackTileLayer extends L.TileLayer {
  override createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement('img');
    tile.alt = '';
    tile.setAttribute('role', 'presentation');

    const primary = this.getTileUrl(coords);
    let fellBack = false;

    const fallback = () => {
      if (fellBack) return;
      fellBack = true;
      tile.src = osmFallbackUrl(coords.z, coords.x, coords.y);
    };

    tile.onerror = fallback;
    tile.onload = () => done(undefined, tile);

    tile.src = primary;
    return tile;
  }
}