import { Component, output, inject, signal } from '@angular/core';
import { I18nService } from '../core/i18n.service';
import { DemoModeService } from '../core/demo-mode.service';
import { BUILD_VERSION } from '../core/build-info';

@Component({
  selector: 'app-map-controls',
  standalone: true,
  template: `
    <div class="cm-fab-stack">
      <button class="cm-fab cm-fab-locate" (click)="locate.emit()" [attr.aria-label]="i18n.t('fab.locate')">
        <span class="cm-fab-icon">⊕</span>
        <span class="cm-fab-label">{{ i18n.t('fab.locate') }}</span>
      </button>

      <button class="cm-fab cm-fab-disaster" (click)="disasterZone.emit()" [attr.aria-label]="i18n.t('fab.disasterZone')">
        <span class="cm-fab-icon">◎</span>
        <span class="cm-fab-label">{{ i18n.t('fab.disasterZone') }}</span>
      </button>

      <button class="cm-fab cm-fab-report"
        (click)="onReportClick()"
        [class.cm-fab-disabled]="reportDisabled()"
        [disabled]="reportDisabled()"
        [attr.aria-label]="i18n.t('fab.report')"
        [attr.title]="reportDisabled() ? i18n.t('demo.fab.tooltip', { limit: demoMode.DEMO_LIMIT }) : null">
        <span class="cm-fab-icon">＋</span>
        <span class="cm-fab-label">{{ i18n.t('fab.report') }}</span>
      </button>

       <button class="cm-fab cm-fab-menu" (click)="toggle()" [attr.aria-label]="menuLabel()" [attr.aria-expanded]="menuOpen()">
        <span class="cm-fab-icon">☰</span>
        <span class="cm-fab-label">{{ menuLabel() }}</span>
      </button>
    </div>

    @if (menuOpen()) {
      <div class="cm-menu-backdrop" (click)="closeMenu()"></div>
      <div class="cm-menu" role="menu" [attr.aria-label]="menuLabel()">
        <header>
          <h3>{{ i18n.t('menu.title') }}</h3>
          <button class="cm-menu-close" (click)="closeMenu()" [attr.aria-label]="i18n.t('common.close')">×</button>
        </header>

        <ul>
          <li>
            <button (click)="emitAndClose('list')">
              <span class="cm-menu-icon">☰</span>
              <span class="cm-menu-text">{{ i18n.t('fab.list') }}</span>
            </button>
          </li>
          <li>
            <button (click)="emitAndClose('filters')">
              <span class="cm-menu-icon">☰</span>
              <span class="cm-menu-text">{{ i18n.t('fab.filters') }}</span>
            </button>
          </li>
          <li>
            <button (click)="emitAndClose('legend')">
              <span class="cm-menu-icon">ⓘ</span>
              <span class="cm-menu-text">{{ i18n.t('fab.legend') }}</span>
            </button>
          </li>
          <li>
            <button (click)="emitAndClose('resources')">
              <span class="cm-menu-icon">⛓</span>
              <span class="cm-menu-text">{{ i18n.t('fab.resources') }}</span>
            </button>
          </li>
          <li>
            <button (click)="emitAndClose('alias')">
              <span class="cm-menu-icon">👤</span>
              <span class="cm-menu-text">{{ i18n.t('fab.alias') }}</span>
            </button>
          </li>
          <li>
            <button (click)="emitAndClose('contact')">
              <span class="cm-menu-icon">✉</span>
              <span class="cm-menu-text">{{ i18n.t('fab.contact') }}</span>
            </button>
          </li>
          <li>
            <button (click)="emitAndClose('terms')">
              <span class="cm-menu-icon">§</span>
              <span class="cm-menu-text">{{ i18n.t('fab.terms') }}</span>
            </button>
          </li>
          <li class="cm-menu-demo-li">
            <button (click)="toggleDemo()" [class.cm-menu-demo-active]="demoMode.isDemo()"
              [class.cm-menu-demo-locked]="demoMode.limitReached()">
              <span class="cm-menu-icon">{{ demoMode.isDemo() ? '✓' : '🧪' }}</span>
              <span class="cm-menu-text">
                {{ demoMode.isDemo() ? i18n.t('demo.menu.deactivate') : i18n.t('demo.menu.activate') }}
                @if (demoMode.isDemo()) {
                  <span class="cm-menu-demo-badge">
                    {{ i18n.t('demo.menu.counter', { count: demoMode.demoIncidentsCreated(), limit: demoMode.DEMO_LIMIT }) }}
                  </span>
                }
              </span>
            </button>
          </li>
        </ul>

        <div class="cm-menu-lang">
          <span class="cm-menu-lang-label">{{ i18n.t('fab.language') }}</span>
          <div class="cm-menu-lang-buttons">
            <button (click)="setLangAndClose('es')" [class.active]="i18n.locale() === 'es'">ES</button>
            <button (click)="setLangAndClose('en')" [class.active]="i18n.locale() === 'en'">EN</button>
            <button (click)="setLangAndClose('pt')" [class.active]="i18n.locale() === 'pt'">PT</button>
          </div>
        </div>

        <footer class="cm-menu-version" [attr.title]="'#' + buildVersion">
          {{ i18n.t('common.version') }} <span class="cm-menu-version-hash">{{ buildVersion }}</span>
        </footer>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .cm-fab-stack {
      position: fixed; right: 16px; bottom: 24px;
      display: flex; flex-direction: column; gap: 10px;
      z-index: 1000;
    }
    .cm-fab {
      display: flex; align-items: center; gap: 8px;
      height: 52px; padding: 0 18px;
      border: none; border-radius: 26px;
      background: #fff; color: #111;
      box-shadow: 0 3px 10px rgba(0,0,0,.3);
      cursor: pointer; font-weight: 700;
    }
    .cm-fab-icon { font-size: 22px; line-height: 1; }
    .cm-fab-label { font-size: 15px; }
    .cm-fab-report { background: #d32f2f; color: #fff; }
    .cm-fab-report .cm-fab-icon { font-size: 28px; }
    .cm-fab-report.cm-fab-disabled,
    .cm-fab-report[disabled] { opacity: 0.5; cursor: not-allowed; }
    .cm-fab-report.cm-fab-disabled:hover:not([disabled]) { background: #d32f2f; }
    .cm-fab-locate { background: #1976d2; color: #fff; }
    .cm-fab-disaster { background: #e65100; color: #fff; animation: cm-disaster-pulse 1.6s ease-out infinite; }
    .cm-fab-menu { background: #424242; color: #fff; }
    @keyframes cm-disaster-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(230, 81, 0, .6), 0 3px 10px rgba(0,0,0,.3); }
      70%  { box-shadow: 0 0 0 16px rgba(230, 81, 0, 0), 0 3px 10px rgba(0,0,0,.3); }
      100% { box-shadow: 0 0 0 0 rgba(230, 81, 0, 0), 0 3px 10px rgba(0,0,0,.3); }
    }
    @media (prefers-reduced-motion: reduce) {
      .cm-fab-disaster { animation: none; }
    }

    .cm-menu-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 1050; }
    .cm-menu {
      position: fixed; right: 16px; bottom: 24px;
      width: min(92vw, 360px);
      background: #fff; color: #111; border-radius: 16px;
      box-shadow: 0 8px 24px rgba(0,0,0,.4);
      overflow: hidden;
      z-index: 1051;
      display: flex; flex-direction: column;
    }
    .cm-menu header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px; border-bottom: 1px solid #eee;
      background: #424242; color: #fff;
    }
    .cm-menu header h3 { margin: 0; font-size: 17px; }
    .cm-menu-close {
      background: transparent; color: #fff; border: none;
      font-size: 24px; line-height: 1; cursor: pointer; padding: 0 6px;
    }
    .cm-menu ul { list-style: none; margin: 0; padding: 6px 0; }
    .cm-menu li { margin: 0; }
    .cm-menu li button {
      display: flex; align-items: center; gap: 14px;
      width: 100%; padding: 14px 18px;
      background: transparent; border: none; text-align: left;
      font-size: 16px; color: #111; cursor: pointer;
    }
    .cm-menu li button:hover, .cm-menu li button:focus { background: #f5f5f5; outline: none; }
    .cm-menu-icon { font-size: 22px; width: 28px; text-align: center; }
    .cm-menu-text { flex: 1; display: flex; align-items: center; gap: 8px; }
    .cm-menu-demo-li button { background: #f5f5f5; }
    .cm-menu-demo-li button:hover,
    .cm-menu-demo-li button:focus { background: #e0e0e0; }
    .cm-menu-demo-active { background: #fff3e0 !important; color: #5d4037; }
    .cm-menu-demo-active:hover,
    .cm-menu-demo-active:focus { background: #ffe0b2 !important; }
    .cm-menu-demo-locked { opacity: 0.85; }
    .cm-menu-demo-badge {
      display: inline-block; padding: 2px 6px; border-radius: 10px;
      background: rgba(0,0,0,0.08);
      font-size: 11px; font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .cm-menu-demo-active .cm-menu-demo-badge { background: rgba(230, 81, 0, 0.18); color: #5d4037; }
    .cm-menu-lang {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px; border-top: 1px solid #eee; background: #fafafa;
    }
    .cm-menu-lang-label { font-size: 14px; font-weight: 600; color: #555; }
    .cm-menu-lang-buttons { display: flex; gap: 6px; }
    .cm-menu-lang-buttons button {
      padding: 8px 14px; min-width: 48px; font-size: 14px; font-weight: 700;
      border: 1px solid #ccc; border-radius: 8px;
      background: #fff; color: #333; cursor: pointer;
    }
    .cm-menu-lang-buttons button.active {
      background: #1976d2; color: #fff; border-color: #1976d2;
    }
    .cm-menu-version {
      padding: 10px 18px;
      border-top: 1px solid #eee;
      background: #fafafa;
      font-size: 12px;
      color: #888;
      text-align: center;
      letter-spacing: .3px;
    }
    .cm-menu-version-hash {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: #555;
      margin-left: 4px;
    }
  `],
})
export class MapControlsComponent {
  readonly i18n = inject(I18nService);
  readonly demoMode = inject(DemoModeService);
  readonly buildVersion = (BUILD_VERSION as string) === 'dev' ? 'dev' : BUILD_VERSION.slice(0, 7);
  readonly menuOpen = signal(false);

  /** The Report FAB is locked when demo mode's lifetime quota is hit. */
  reportDisabled(): boolean {
    return this.demoMode.isDemo() && this.demoMode.limitReached();
  }

  /** Honor the disabled attribute: belt-and-suspenders against the form opening. */
  onReportClick(): void {
    if (this.reportDisabled()) return;
    this.report.emit();
  }

  readonly report = output<void>();
  readonly locate = output<void>();
  readonly disasterZone = output<void>();
  readonly list = output<void>();
  readonly filters = output<void>();
  readonly legend = output<void>();
  readonly resources = output<void>();
  readonly terms = output<void>();
  readonly contact = output<void>();
  readonly alias = output<void>();
  readonly demo = output<void>();
  readonly toggleLang = output<void>();
  readonly toggleMenu = output<void>();

  toggle(): void {
    this.menuOpen.update(v => !v);
    this.toggleMenu.emit();
  }
  readonly setLocale = output<'es' | 'en' | 'pt'>();

  menuLabel(): string {
    return this.i18n.t('fab.menu');
  }

  /**
   * Toggle demo mode straight from the menu. We don't emit an event and
   * defer the response to App — the DemoModeService itself owns the
   * service lifecycle (sessionStorage + cache wipe + reload). The
   * menu just hands control over to it.
   */
  async toggleDemo(): Promise<void> {
    this.menuOpen.set(false);
    if (this.demoMode.isDemo()) {
      // Leaving demo also fires its own reload (see DemoBanner.exit()).
      await this.demoMode.deactivate();
      if (typeof window !== 'undefined') window.location.reload();
    } else {
      this.demoMode.activate({ cleanUrl: true });
      // Refresh quota for live counter display.
      void this.demoMode.refreshQuota();
      // Reload so any cached /incidents responses get fresh flags.
      if (typeof window !== 'undefined') window.location.reload();
    }
  }

  emitAndClose(name: string): void {
    this.menuOpen.set(false);
    switch (name) {
      case 'list': this.list.emit(); break;
      case 'alias': this.alias.emit(); break;
      case 'filters': this.filters.emit(); break;
      case 'legend': this.legend.emit(); break;
      case 'resources': this.resources.emit(); break;
      case 'terms': this.terms.emit(); break;
      case 'contact': this.contact.emit(); break;
    }
  }

  setLangAndClose(l: 'es' | 'en' | 'pt'): void {
    this.i18n.setLocale(l);
    this.menuOpen.set(false);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }
}