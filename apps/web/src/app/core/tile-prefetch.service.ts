import { Injectable, inject, signal, computed } from '@angular/core';
import { NetworkService } from './network.service';
import {
  DISASTER_ZONE,
  CRITICAL_ZONES,
  COUNTRY_ZONE,
} from '../shared/constants';
import { environment } from '../../environments/environment';

const STORAGE_KEY = 'crisismap_tiles_prefetched_v3';
const MAX_CONCURRENT = 10;

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

interface PrefetchStatus {
  running: boolean;
  total: number;
  done: number;
  failed: number;
  startedAt: number | null;
  currentZone: string | null;
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
    currentZone: null,
  });

  readonly visible = computed(() => this.status().running);
  readonly progress = computed(() => {
    const s = this.status();
    if (!s.total) return 0;
    return Math.round(((s.done + s.failed) / s.total) * 100);
  });

  /**
   * Builds the list of tile URLs to prefetch for every zone in scope.
   *
   * In production the URL template points at the self-hosted CloudFront
   * distribution (so we never depend on OSM's servers at runtime). In
   * dev the template still points at OSM directly so a contributor
   * doesn't need to spin up the bucket to iterate.
   *
   * Each zone declares its own bbox + zoom range, so the tile list
   * combines a wide regional view of the disaster zone with
   * street-level detail for the highest-priority neighborhoods.
   */
  buildTileList(): string[] {
    const zones: Array<{
      name: string;
      bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
      zooms: readonly number[];
    }> = [
      ...CRITICAL_ZONES.map((z) => ({
        name: z.name,
        bbox: z.bbox,
        zooms: z.prefetchZooms,
      })),
      {
        name: 'Disaster zone',
        bbox: DISASTER_ZONE.bbox,
        zooms: DISASTER_ZONE.prefetchZooms,
      },
      {
        name: COUNTRY_ZONE.name,
        bbox: COUNTRY_ZONE.bbox,
        zooms: COUNTRY_ZONE.prefetchZooms,
      },
    ];

    const urls: string[] = [];
    for (const zone of zones) {
      const { minLat, maxLat, minLng, maxLng } = zone.bbox;
      for (const z of zone.zooms) {
        const xMin = lngToTileX(minLng, z);
        const xMax = lngToTileX(maxLng, z);
        const yMin = latToTileY(maxLat, z);
        const yMax = latToTileY(minLat, z);
        for (let x = xMin; x <= xMax; x++) {
          for (let y = yMin; y <= yMax; y++) {
            urls.push(this.tileUrl(z, x, y));
          }
        }
      }
    }
    // Dedupe (overlapping bboxes at the same zoom can share edges).
    return Array.from(new Set(urls));
  }

  private tileUrl(z: number, x: number, y: number): string {
    return environment.tileUrl
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
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
   * Force a fresh prefetch (used by the prefetch banner's reload
   * button, or by a "Redownload map" menu item in the future).
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
      currentZone: null,
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
          // We use 'no-cors' because the self-hosted CDN returns a
          // permissive CORS policy but the request still might race
          // with other opac responses; 'no-cors' guarantees the SW
          // caches something usable. Browser later loads the same
          // URL via <img> tags (which aren't subject to CORS).
          await fetch(url, {
            mode: 'no-cors',
            signal: this.abortController?.signal,
          });
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

    this.status.update((s) => ({ ...s, running: false, currentZone: null }));

    // Mark complete only if at least 90% landed. Anything below that
    // means our CDN is misconfigured or the SW rejected the requests
    // and we should retry on the next launch.
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
      currentZone: null,
    });
  }
}