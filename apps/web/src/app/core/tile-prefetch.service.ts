import { Injectable, inject, signal, computed } from '@angular/core';
import { NetworkService } from './network.service';
import { DISASTER_ZONE, OSM_TILE_SUBDOMAINS } from '../shared/constants';

const STORAGE_KEY = 'crisismap_tiles_prefetched_v1';
const MAX_CONCURRENT = 6;

function lngToTileX(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
}

function latToTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );
}

function tileUrl(sub: string, z: number, x: number, y: number): string {
  return `https://${sub}.tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

interface PrefetchStatus {
  running: boolean;
  total: number;
  done: number;
  failed: number;
  startedAt: number | null;
}

@Injectable({ providedIn: 'root' })
export class TilePrefetchService {
  private network = inject(NetworkService);
  private abortController?: AbortController;

  readonly status = signal<PrefetchStatus>({
    running: false,
    total: 0,
    done: 0,
    failed: 0,
    startedAt: null,
  });

  readonly visible = computed(() => this.status().running);
  readonly progress = computed(() => {
    const s = this.status();
    if (!s.total) return 0;
    return Math.round(((s.done + s.failed) / s.total) * 100);
  });

  /**
   * Builds the list of tile URLs to prefetch for the disaster zone.
   * Pure function so it can be unit-tested without a service instance.
   */
  buildTileList(): string[] {
    const { minLat, maxLat, minLng, maxLng } = DISASTER_ZONE.bbox;
    const urls: string[] = [];
    for (const z of DISASTER_ZONE.prefetchZooms) {
      const xMin = lngToTileX(minLng, z);
      const xMax = lngToTileX(maxLng, z);
      const yMin = latToTileY(maxLat, z); // lat decreases as y increases
      const yMax = latToTileY(minLat, z);
      for (let x = xMin; x <= xMax; x++) {
        for (let y = yMin; y <= yMax; y++) {
          const sub = OSM_TILE_SUBDOMAINS[(x + y + z) % OSM_TILE_SUBDOMAINS.length];
          urls.push(tileUrl(sub, z, x, y));
        }
      }
    }
    return urls;
  }

  /**
   * Run the prefetch if it hasn't completed for the current version.
   * The flag in localStorage tells us not to redo it on every launch.
   */
  prefetchIfNeeded(): void {
    if (this.status().running) return;
    if (!this.network.isOnline()) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') return;
    } catch {
      /* ignore */
    }
    void this.run();
  }

  /**
   * Force a fresh prefetch (used by the "Redownload map" button in the
   * prefetch banner's overflow menu).
   */
  async run(): Promise<void> {
    if (this.status().running) return;
    const urls = this.buildTileList();
    if (!urls.length) return;
    if (!this.network.isOnline()) return;

    this.abortController = new AbortController();
    this.status.set({
      running: true,
      total: urls.length,
      done: 0,
      failed: 0,
      startedAt: Date.now(),
    });

    let done = 0;
    let failed = 0;
    const queue = [...urls];

    const worker = async () => {
      while (queue.length) {
        if (this.abortController?.signal.aborted) return;
        const url = queue.shift();
        if (!url) return;
        try {
          // The Angular SW dataGroup "map-tiles" intercepts these
          // fetches and writes the response into its Cache API.
          // We don't need to handle the response here — we just need
          // the request to land so the SW can cache it.
          await fetch(url, { signal: this.abortController?.signal });
          done++;
        } catch {
          failed++;
        } finally {
          this.status.update((s) => ({
            ...s,
            done,
            failed,
          }));
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(MAX_CONCURRENT, urls.length) }, () => worker()),
    );

    this.status.update((s) => ({ ...s, running: false }));

    // Persist the completion flag only if we got at least most tiles.
    // We allow up to 10% failures (network blips, OSM rate limits).
    if (done + failed === urls.length && done / urls.length >= 0.9) {
      try {
        localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        /* ignore */
      }
    }
  }

  cancel(): void {
    this.abortController?.abort();
    this.status.set({
      running: false,
      total: 0,
      done: 0,
      failed: 0,
      startedAt: null,
    });
  }
}