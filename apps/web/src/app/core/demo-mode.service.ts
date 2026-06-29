import { Injectable, inject, signal, computed } from '@angular/core';
import { DeviceIdService } from './device-id.service';
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
 * Note: this service does NOT inject `ApiClientService` to avoid a
 * circular DI graph (ApiClient ↔ DemoMode). It hits the backend
 * directly via fetch + the deviceId from DeviceIdService, which has
 * no forward dependencies on either.
 */
@Injectable({ providedIn: 'root' })
export class DemoModeService {
  private readonly device = inject(DeviceIdService, { optional: true });

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

  /** Turn demo mode off and refresh the page to re-fetch non-demo data. */
  deactivate(): void {
    this.isDemo.set(false);
    try { sessionStorage.removeItem(SESSION_FLAG); } catch { /* ignore */ }
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

