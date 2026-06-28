import { Component, signal, inject } from '@angular/core';
import { I18nService } from '../core/i18n.service';

const COLLAPSED_FLAG = 'crisismap_quake_banner_collapsed_v1';
const DISMISSED_FLAG = 'crisismap_quake_banner_dismissed_v1';

@Component({
  selector: 'app-quake-banner',
  standalone: true,
  template: `
    @if (visible()) {
      @if (expanded()) {
        <div class="cm-quake-banner cm-quake-expanded" role="status">
          <span class="cm-quake-icon">⚠</span>
          <div class="cm-quake-text">
            <strong>{{ i18n.t('banner.quake.summary') }}</strong>
            <span class="cm-quake-detail">{{ i18n.t('banner.quake.detail') }}</span>
          </div>
          <button class="cm-quake-btn" (click)="collapse()" [attr.aria-label]="i18n.t('banner.minimize')">−</button>
          <button class="cm-quake-btn" (click)="dismiss()" [attr.aria-label]="i18n.t('banner.dismiss')">×</button>
        </div>
      } @else {
        <div class="cm-quake-pill-wrap" role="status">
          <button class="cm-quake-pill" (click)="expand()" [attr.aria-label]="i18n.t('banner.quake.summary')">
            <span class="cm-quake-icon">⚠</span>
            <span class="cm-quake-pill-text">{{ summaryShort() }}</span>
          </button>
          <button class="cm-quake-x" (click)="dismiss()" [attr.aria-label]="i18n.t('banner.dismiss')">×</button>
        </div>
      }
    }
  `,
  styles: [`
    :host { display: contents; }

    /* Expanded (full-width bar) */
    .cm-quake-banner {
      width: 100%;
      display: flex; align-items: center; gap: 4px;
      padding: 6px 6px 6px 12px;
      background: rgba(183, 28, 28, .94);
      backdrop-filter: blur(4px);
      box-shadow: 0 1px 3px rgba(0,0,0,.12);
      border-top: 1px solid rgba(255,255,255,.18);
      font-size: 13px; line-height: 1.25;
      color: #fff;
      font-family: inherit;
    }
    .cm-quake-icon { font-size: 14px; flex: 0 0 auto; }
    .cm-quake-text { flex: 1; min-width: 0; }
    .cm-quake-text strong { font-weight: 700; display: block; }
    .cm-quake-detail {
      display: block;
      font-size: 12px; opacity: .92;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-weight: 400;
    }
    .cm-quake-btn {
      background: transparent; color: #fff;
      border: none; font-size: 16px; line-height: 1; cursor: pointer;
      padding: 0 6px; min-width: 28px; min-height: 28px;
      border-radius: 4px; flex: 0 0 auto;
    }
    .cm-quake-btn:hover { background: rgba(255,255,255,.18); }

    /* Collapsed (small pill, auto-sized) */
    .cm-quake-pill-wrap {
      position: fixed; top: 4px; left: 50%;
      transform: translateX(-50%);
      z-index: 1050;
      display: inline-flex; align-items: stretch; gap: 2px;
      max-width: 92vw;
    }
    .cm-quake-pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 12px;
      max-width: 60vw;
      background: rgba(183, 28, 28, .88);
      border: none; color: #fff;
      cursor: pointer; font: inherit; font-weight: 600;
      border-radius: 10px 0 0 10px;
      box-shadow: 0 2px 6px rgba(0,0,0,.18);
      flex: 1; min-width: 0;
    }
    .cm-quake-pill:hover { background: rgba(183, 28, 28, 1); }
    .cm-quake-pill-text {
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-weight: 600; font-size: 13px;
    }
    .cm-quake-x {
      background: rgba(183, 28, 28, .88);
      border: none; color: #fff;
      cursor: pointer; font: inherit;
      padding: 0 10px;
      min-width: 28px;
      border-radius: 0 10px 10px 0;
      box-shadow: 0 2px 6px rgba(0,0,0,.18);
      flex: 0 0 auto;
    }
    .cm-quake-x:hover { background: rgba(183, 28, 28, 1); }

    @media (max-width: 600px) {
      .cm-quake-detail { display: none; }
      .cm-quake-banner { padding: 4px 4px 4px 10px; }
    }
  `],
})
export class QuakeBannerComponent {
  readonly i18n = inject(I18nService);
  readonly visible = signal(true);
  readonly expanded = signal(false);

  constructor() {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(DISMISSED_FLAG) === '1') {
      this.visible.set(false);
      return;
    }
    if (localStorage.getItem(COLLAPSED_FLAG) === '1') {
      this.expanded.set(false);
    }
  }

  collapse(): void {
    this.expanded.set(false);
    try { localStorage.setItem(COLLAPSED_FLAG, '1'); } catch { /* ignore */ }
  }

  expand(): void {
    this.expanded.set(true);
  }

  dismiss(): void {
    this.visible.set(false);
    try {
      localStorage.setItem(DISMISSED_FLAG, '1');
      localStorage.removeItem(COLLAPSED_FLAG);
    } catch { /* ignore */ }
  }

  summaryShort(): string {
    const summary = this.i18n.t('banner.quake.summary');
    return summary.length > 60 ? summary.slice(0, 57) + '…' : summary;
  }
}
