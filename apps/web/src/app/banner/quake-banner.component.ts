import { Component, signal, inject } from '@angular/core';
import { I18nService } from '../core/i18n.service';

@Component({
  selector: 'app-quake-banner',
  standalone: true,
  template: `
    @if (visible()) {
      <div class="cm-quake-banner" role="alert">
        <span class="cm-quake-icon">⚠</span>
        <span class="cm-quake-text">
          <strong>{{ i18n.t('banner.quake.summary') }}</strong>
        </span>
        <span class="cm-quake-detail">{{ i18n.t('banner.quake.detail') }}</span>
        <button class="cm-quake-dismiss" (click)="dismiss()" [attr.aria-label]="i18n.t('banner.dismiss')">×</button>
      </div>
    }
  `,
  styles: [`
    .cm-quake-banner {
      position: fixed; top: 0; left: 0; right: 0; z-index: 1100;
      background: #b71c1c; color: #fff;
      display: flex; align-items: center; gap: 12px;
      padding: 10px 16px;
      font-size: 14px; line-height: 1.3;
      box-shadow: 0 2px 8px rgba(0,0,0,.4);
    }
    .cm-quake-icon { font-size: 20px; }
    .cm-quake-text strong { font-weight: 800; }
    .cm-quake-text, .cm-quake-detail { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cm-quake-detail { font-size: 12px; opacity: 0.92; margin-left: 4px; }
    .cm-quake-dismiss {
      margin-left: auto; background: transparent; color: #fff;
      border: none; font-size: 22px; line-height: 1; cursor: pointer;
      padding: 0 6px; min-width: 32px; min-height: 32px;
    }
    @media (max-width: 600px) {
      .cm-quake-detail { display: none; }
    }
  `],
})
export class QuakeBannerComponent {
  readonly i18n = inject(I18nService);
  readonly visible = signal(true);
  dismiss(): void { this.visible.set(false); }
}