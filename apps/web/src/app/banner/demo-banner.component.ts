import { Component, inject, computed } from '@angular/core';
import { DemoModeService } from '../core/demo-mode.service';
import { I18nService } from '../core/i18n.service';

/**
 * Permanent banner shown while the user has demo mode active in this
 * session. There is no dismiss button by design — the user must
 * either complete the demo and reload, or hit "Salir" to leave
 * demo mode. This guarantees the user is never confused about
 * whether they are publishing real reports.
 */
@Component({
  selector: 'app-demo-banner',
  standalone: true,
  template: `
    @if (demoMode.isDemo()) {
      <div class="cm-demo-banner" [class.cm-demo-banner-limit]="demoMode.limitReached()"
           role="status" aria-live="polite">
        <div class="cm-demo-banner-icon">⚠</div>
        <div class="cm-demo-banner-body">
          <div class="cm-demo-banner-title">{{ i18n.t('demo.banner.title') }}</div>
          <div class="cm-demo-banner-desc">
            {{ i18n.t('demo.banner.body') }}
            <span class="cm-demo-banner-counter">
              {{ i18n.t('demo.banner.counter', { count: demoMode.demoIncidentsCreated(), limit: demoMode.DEMO_LIMIT }) }}
            </span>
            @if (demoMode.limitReached()) {
              <span class="cm-demo-banner-locked">
                · {{ i18n.t('demo.banner.limitReached.body', { limit: demoMode.DEMO_LIMIT }) }}
              </span>
            }
          </div>
        </div>
        <button class="cm-demo-banner-exit" (click)="exit()" type="button">
          {{ i18n.t('demo.banner.exit') }}
        </button>
      </div>
    }
  `,
  styles: [`
    .cm-demo-banner {
      position: fixed; left: 0; right: 0; top: 0;
      z-index: 1075;
      background: #fff3e0; color: #5d4037;
      border-bottom: 3px solid #fb8c00;
      padding: 8px 16px;
      display: flex; align-items: center; gap: 12px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.08);
      font-size: 14px;
    }
    .cm-demo-banner.cm-demo-banner-limit {
      background: #ffebee; color: #b71c1c;
      border-bottom-color: #c62828;
    }
    .cm-demo-banner-icon {
      font-size: 22px; flex: 0 0 auto; line-height: 1;
    }
    .cm-demo-banner-body { flex: 1; min-width: 0; }
    .cm-demo-banner-title { font-weight: 700; font-size: 14px; }
    .cm-demo-banner-desc {
      font-size: 12px; opacity: 0.9; line-height: 1.4; margin-top: 2px;
    }
    .cm-demo-banner-counter {
      font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      padding: 0 4px;
    }
    .cm-demo-banner-locked { font-weight: 700; }
    .cm-demo-banner-exit {
      flex: 0 0 auto;
      padding: 8px 14px;
      background: transparent;
      border: 1px solid currentColor;
      border-radius: 18px;
      color: inherit;
      font-size: 13px; font-weight: 700;
      cursor: pointer;
    }
    .cm-demo-banner-exit:hover { background: rgba(0,0,0,0.08); }
    @media (max-width: 480px) {
      .cm-demo-banner { padding: 8px 12px; }
      .cm-demo-banner-exit { padding: 6px 10px; font-size: 12px; }
    }
  `],
})
export class DemoBannerComponent {
  readonly demoMode = inject(DemoModeService);
  readonly i18n = inject(I18nService);

  readonly title = computed(() => this.i18n.t('demo.banner.title'));

  async exit(): Promise<void> {
    // Deactivate clears sessionStorage AND wipes local demo caches
    // (IDB incidents + tile cache) so the reload doesn't surface
    // the user's own demo data.
    await this.demoMode.deactivate();
    if (typeof window !== 'undefined') window.location.reload();
  }
}
