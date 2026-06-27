import { Component, output, inject, signal } from '@angular/core';
import { I18nService } from '../core/i18n.service';

@Component({
  selector: 'app-map-controls',
  standalone: true,
  template: `
    <div class="cm-fab-stack">
      <button class="cm-fab cm-fab-locate" (click)="locate.emit()" [attr.aria-label]="i18n.t('fab.locate')">
        <span class="cm-fab-icon">⊕</span>
        <span class="cm-fab-label">{{ i18n.t('fab.locate') }}</span>
      </button>

      <button class="cm-fab cm-fab-report" (click)="report.emit()" [attr.aria-label]="i18n.t('fab.report')">
        <span class="cm-fab-icon">＋</span>
        <span class="cm-fab-label">{{ i18n.t('fab.report') }}</span>
      </button>

      <button class="cm-fab cm-fab-menu" (click)="toggleMenu.emit()" [attr.aria-label]="menuLabel()" [attr.aria-expanded]="menuOpen()">
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
        </ul>

        <div class="cm-menu-lang">
          <span class="cm-menu-lang-label">{{ i18n.t('fab.language') }}</span>
          <div class="cm-menu-lang-buttons">
            <button (click)="setLangAndClose('es')" [class.active]="i18n.locale() === 'es'">ES</button>
            <button (click)="setLangAndClose('en')" [class.active]="i18n.locale() === 'en'">EN</button>
            <button (click)="setLangAndClose('pt')" [class.active]="i18n.locale() === 'pt'">PT</button>
          </div>
        </div>
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
    .cm-fab-locate { background: #1976d2; color: #fff; }
    .cm-fab-menu { background: #424242; color: #fff; }

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
    .cm-menu-text { flex: 1; }
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
  `],
})
export class MapControlsComponent {
  readonly i18n = inject(I18nService);
  readonly menuOpen = signal(false);

  readonly report = output<void>();
  readonly locate = output<void>();
  readonly filters = output<void>();
  readonly legend = output<void>();
  readonly resources = output<void>();
  readonly terms = output<void>();
  readonly contact = output<void>();
  readonly toggleLang = output<void>();
  readonly toggleMenu = output<void>();
  readonly setLocale = output<'es' | 'en' | 'pt'>();

  menuLabel(): string {
    return this.i18n.t('fab.menu');
  }

  emitAndClose(name: string): void {
    this.menuOpen.set(false);
    switch (name) {
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