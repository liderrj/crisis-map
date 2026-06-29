import { Injectable, inject, signal, computed } from '@angular/core';
import { DeviceIdService } from './device-id.service';
import { StorageService } from './storage.service';
import { IncidentCacheService } from './incident-cache.service';
import { environment } from '../../environments/environment';

const SESSION_FLAG = 'crisismap_demo_active';

/**
 * Demo Mode service.
 *
 * Activated by URL `?demo=1` (optionally `?demo=0` to turn off).
 * Persisted in sessionStorage so accidental reloads keep the mode on
 * for that session, but PWA reinstalls / new devices start fresh.
 *
 * In demo mode, ALL writes (incident create + confirmations) carry
 * `isDemo: true` and are filtered out of regular user GETs by the
 * backend. The lifetime counter `Devices.demoIncidentsCreated`
 * (max 5) is enforced server-side; we mirror it locally for UI.
 *
 * The counter is **per-device, lifetime** — it does NOT reset on
 * session end. Only the `purge-test-incidents.mjs` script or the
 * AWS console can reset it.
 *
 * Cache hygiene: when the user exits demo mode we drop every locally
 * cached demo-flagged incident and every tile cache entry, so the
 * next reload does not surface demo data through stale storage
 * (the tile cache was written with `?demo=1` and its etag does not
 * match the `?demo=0` request the freshly booted page makes).
 *
 * DI dependency notes:
 *   - Does NOT inject `ApiClientService` (would create a cycle).
 *   - Injects `StorageService` + `IncidentCacheService`, both of
 *     which have no forward dependency on this service.
 */
@Injectable({ providedIn: 'root' })
export class DemoModeService {
  private readonly device = inject(DeviceIdService, { optional: true });
  private readonly storage = inject(StorageService);
  private readonly cache = inject(IncidentCacheService);

  readonly DEMO_LIMIT = 5;

  /** True while the user is in this tab/session with demo mode on. */
  readonly isDemo = signal<boolean>(false);
  /** Mirrors Devices.demoIncidentsCreated for the current device. */
  readonly demoIncidentsCreated = signal<number>(0);
  /** Cap reached — UI uses this to disable Report FAB etc. */
  readonly limitReached = computed(() =>
    this.isDemo() && this.demoIncidentsCreated() >= this.DEMO_LIMIT,
  );

  /**
   * Reads the URL and sessionStorage, sets the flag accordingly.
   * If demo is active, fetches the live counter from the backend.
   */
  init(): void {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('demo');
    if (fromUrl === '1') {
      this.activate({ cleanUrl: true });
    } else if (fromUrl === '0') {
      this.deactivate();
    } else if (sessionStorage.getItem(SESSION_FLAG) === '1') {
      this.isDemo.set(true);
    }
    if (this.isDemo()) void this.refreshQuota();
  }

  /** Turn demo mode on for the rest of this browser session. */
  activate(opts: { cleanUrl?: boolean } = {}): void {
    this.isDemo.set(true);
    try { sessionStorage.setItem(SESSION_FLAG, '1'); } catch { /* ignore */ }
    if (opts.cleanUrl) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('demo');
        window.history.replaceState({}, '', url.toString());
      } catch { /* ignore */ }
    }
  }

  /**
   * Turn demo mode off and clear every locally-cached demo artifact.
   * The page is expected to reload right after — the flag flip
   * alone is not enough because stale tile + IDB caches would
   * still serve the user's demo reports until their TTLs expire.
   */
  async deactivate(): Promise<void> {
    this.isDemo.set(false);
    try { sessionStorage.removeItem(SESSION_FLAG); } catch { /* ignore */ }
    await this.clearLocalDemoArtifacts();
  }

  /**
   * Best-effort wipe: incidents flagged isDemo in the IDB cache
   * and the entire bbox-keyed tile cache. Errors are swallowed
   * because reload will still proceed even if local wipe fails
   * (worst case is a few stale markers until the next revalidate).
   */
  private async clearLocalDemoArtifacts(): Promise<void> {
    try {
      await this.storage.clearDemoIncidents();
    } catch { /* ignore */ }
    try {
      await this.cache.clearAllTiles();
    } catch { /* ignore */ }
  }

  /**
   * Fetch the per-device demo counter directly from the backend.
   * We avoid injecting ApiClientService here to break the cyclic
   * graph (ApiClient ↔ DemoMode).
   */
  async refreshQuota(): Promise<void> {
    if (typeof fetch === 'undefined') return;
    try {
      const deviceId = this.device?.device()?.deviceId;
      if (!deviceId) return;
      const res = await fetch(`${environment.apiUrl}/devices/quota`, {
        headers: { deviceId },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const q = await res.json() as { demoIncidentsCreated: number };
      this.demoIncidentsCreated.set(q.demoIncidentsCreated ?? 0);
    } catch {
      // best-effort; counter will sync next time the report form fires
    }
  }

  /**
   * Called by ReportForm after a successful demo submit so the local
   * counter stays in sync with the backend. The backend is the source
   * of truth — we don't decrement on error.
   */
  recordDemoIncidentCreated(): void {
    if (!this.isDemo()) return;
    this.demoIncidentsCreated.update((n) => n + 1);
  }
}
