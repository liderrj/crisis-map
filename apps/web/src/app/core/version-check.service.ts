import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { BUILD_VERSION } from './build-info';

/**
 * Detects when the deployed bundle is older than what the CDN now serves
 * and forces a hard reload to pick up the new build.
 *
 * Why we need this: Angular's service worker downloads a new version but
 * keeps serving the old one until all tabs close. On mobile (and in long
 * single-tab sessions on desktop) the user would never see deploys
 * until they manually refresh.
 *
 * Why we use SwUpdate (and not a manual version.txt comparison):
 * the SW keeps the previous app shell + JS chunk in its cache. If we
 * simply change window.location.href, the SW serves the same old
 * index.html → same old main-XXX.js → same old BUILD_VERSION → another
 * reload, into an infinite loop. SwUpdate's `activateUpdate()` actually
 * swaps the SW so the next load hits the new chunks.
 *
 * As a belt-and-suspenders:
 *  - We also keep `version.txt` and reload when the bundled hash
 *    disagrees with the deployed one. This catches deployments that
 *    don't change the SW (e.g. edits to inlined HTML / assets).
 *  - The reload is gated by `sessionStorage` so it can fire at most
 *    once per browser tab/session, preventing reload loops even if
 *    something else goes wrong (stale SW, bad CDN, partial deploy).
 */
@Injectable({ providedIn: 'root' })
export class VersionCheckService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly checkInterval = 60 * 60 * 1000; // 1 hour
  private readonly RELOAD_FLAG = 'cm_version_reloaded';

  readonly outdated = signal(false);
  readonly checkedAt = signal<number | null>(null);

  private timer?: ReturnType<typeof setInterval>;

  start(): void {
    if ((BUILD_VERSION as string) === 'dev') return; // local dev — skip

    this.bindSwUpdate();
    this.timer = setInterval(() => void this.check(), this.checkInterval);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Subscribe to Angular SW update events. When a new version is
   * detected, activate it (so the SW uses the new cache) and reload
   * once. Gated by sessionStorage to never reload twice.
   */
  private bindSwUpdate(): void {
    if (!this.swUpdate.isEnabled) return;
    this.swUpdate.versionUpdates.subscribe((evt) => {
      if (evt.type === 'VERSION_READY' || evt.type === 'VERSION_DETECTED') {
        this.outdated.set(true);
        void this.activateAndReload();
      }
    });
  }

  /**
   * Belt-and-suspenders: compare bundled hash with the deployed
   * /version.txt. Only fires a reload when they disagree AND we
   * haven't already reloaded this session.
   *
   * Note: even if a discrepancy is detected, the actual reload URL
   * uses a cache-busting fragment so the SW serves fresh content
   * (no URL-level caching survives the reload).
   */
  async check(): Promise<void> {
    if ((BUILD_VERSION as string) === 'dev') return;
    if (this.swUpdate.isEnabled) {
      // SwUpdate already drives the update flow; don't double-fire.
      void this.swUpdate.checkForUpdate();
      return;
    }
    // Path taken only when SW is disabled (e.g. iOS private mode, etc.)
    let remote: string;
    try {
      const res = await fetch(`/version.txt?cb=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache', pragma: 'no-cache' },
      });
      if (!res.ok) return;
      remote = (await res.text()).trim();
    } catch {
      return;
    }
    this.checkedAt.set(Date.now());
    if (!remote || remote === BUILD_VERSION) return;
    this.outdated.set(true);
    this.maybeReload(remote);
  }

  private async activateAndReload(): Promise<void> {
    if (this.hasReloaded()) return;
    try {
      await this.swUpdate.activateUpdate();
    } catch {
      // activation may fail if no update is ready; fall through to reload
    }
    this.markReloaded();
    // Hard reload bypassing cache. The t=<ts> query breaks any SW
    // URL-level cache hit and re-fetches index.html from network.
    window.location.replace(`${window.location.pathname}?t=${Date.now()}${window.location.hash}`);
  }

  private maybeReload(remote: string): void {
    if (this.hasReloaded()) return;
    this.markReloaded();
    window.location.replace(`${window.location.pathname}?v=${encodeURIComponent(remote)}&t=${Date.now()}${window.location.hash}`);
  }

  private hasReloaded(): boolean {
    try {
      return sessionStorage.getItem(this.RELOAD_FLAG) === '1';
    } catch {
      return false;
    }
  }

  private markReloaded(): void {
    try {
      sessionStorage.setItem(this.RELOAD_FLAG, '1');
    } catch {
      /* ignore */
    }
  }
}
