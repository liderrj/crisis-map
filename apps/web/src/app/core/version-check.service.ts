import { Injectable, inject, signal } from '@angular/core';
import { NetworkService } from './network.service';
import { BUILD_VERSION } from './build-info';

/**
 * Detects when the deployed bundle is older than what the CDN now serves
 * (i.e. the user has a stuck old version of the PWA) and forces a hard
 * reload to pick up the new build.
 *
 * Why we need this: Angular's service worker downloads a new version but
 * keeps serving the old one until all tabs close. On mobile (and in long
 * single-tab sessions on desktop) the user would otherwise never see
 * deploys until they manually refresh.
 *
 * How it works:
 * 1. At build time, `generate-version.js` writes the short git commit hash
 *    to both `public/version.txt` (served at runtime) and the bundled
 *    `build-info.ts` constant `BUILD_VERSION`.
 * 2. On app start we fetch `/version.txt` with cache-busting headers.
 *    The Netlify config sends `no-cache, no-store` for it.
 * 3. If the remote version differs from our bundled version, hard reload
 *    once (window.__cmVersionChecked guards against reload loops).
 * 4. We only check when online to avoid wasted work offline, and we
 *    tolerate offline failures silently.
 */
@Injectable({ providedIn: 'root' })
export class VersionCheckService {
  private readonly network = inject(NetworkService);
  private readonly checkInterval = 60 * 60 * 1000; // 1 hour

  readonly outdated = signal(false);
  readonly checkedAt = signal<number | null>(null);

  private timer?: ReturnType<typeof setInterval>;

  start(): void {
    if ((BUILD_VERSION as string) === 'dev') return; // local dev — skip
    void this.check();
    this.timer = setInterval(() => void this.check(), this.checkInterval);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Returns true if the bundled version matches the deployed version.
   * Triggers a hard reload (once, guarded) when mismatch detected.
   */
  async check(): Promise<void> {
    if (!this.network.isOnline()) return;
    const guard = (globalThis as Record<string, unknown>)['__cmVersionChecked'];

    let remote: string;
    try {
      const res = await fetch(`/version.txt?cb=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
      });
      if (!res.ok) return;
      remote = (await res.text()).trim();
    } catch {
      return; // offline or network error — try again later
    }

    this.checkedAt.set(Date.now());

    if (!remote || remote === (BUILD_VERSION as string)) return;

    this.outdated.set(true);

    if (guard) return; // already triggered a reload this session
    (globalThis as Record<string, unknown>)['__cmVersionChecked'] = true;

    // Force-reload bypassing the SW. `?v=<remote>` busts the HTTP cache
    // for the index.html request that follows.
    window.location.href = `${window.location.pathname}?v=${encodeURIComponent(remote)}${window.location.hash}`;
  }
}
