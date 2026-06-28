import { Component, inject, signal, computed } from '@angular/core';
import { NetworkService } from '../core/network.service';
import { I18nService } from '../core/i18n.service';

@Component({
  selector: 'app-offline-banner',
  standalone: true,
  template: `
    @if (show() && !network.isOnline()) {
      <div class="cm-offline" role="status">
        <span class="cm-offline-dot"></span>
        <span class="cm-offline-text">{{ i18n.t('offline.message') }}</span>
        <button class="cm-offline-dismiss" (click)="dismiss()" [attr.aria-label]="i18n.t('offline.dismiss')">×</button>
      </div>
    }
  `,
  styles: [`
    .cm-offline {
      width: 100%;
      display: flex; align-items: center; gap: 8px;
      padding: 6px 12px;
      background: #f9a825; color: #111;
      font-size: 13px; font-weight: 600;
      box-shadow: 0 1px 3px rgba(0,0,0,.12);
      font-family: inherit;
      line-height: 1.3;
    }
    .cm-offline-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: #111; flex: 0 0 auto;
      animation: cm-offline-pulse 1.4s ease-in-out infinite;
    }
    @keyframes cm-offline-pulse {
      0%, 100% { opacity: .35; }
      50%      { opacity: 1; }
    }
    .cm-offline-text {
      flex: 1; min-width: 0;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .cm-offline-dismiss {
      background: transparent; border: none; color: #111;
      font-size: 18px; line-height: 1; cursor: pointer;
      padding: 0 4px; flex: 0 0 auto;
    }
  `],
})
export class OfflineBannerComponent {
  readonly network = inject(NetworkService);
  readonly i18n = inject(I18nService);
  private dismissed = signal(false);

  show = computed(() => !this.dismissed());

  dismiss(): void {
    this.dismissed.set(true);
  }
}
