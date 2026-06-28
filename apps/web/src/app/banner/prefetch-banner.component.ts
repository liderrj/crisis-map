import { Component, inject } from '@angular/core';
import { TilePrefetchService } from '../core/tile-prefetch.service';
import { I18nService } from '../core/i18n.service';

@Component({
  selector: 'app-prefetch-banner',
  standalone: true,
  template: `
    @if (prefetch.visible()) {
      <div class="cm-prefetch" role="status">
        <div class="cm-prefetch-text">
          <span class="cm-prefetch-icon">⤓</span>
          <span>{{ i18n.t('prefetch.title') }}</span>
          <span class="cm-prefetch-count">
            {{ prefetch.status().done }}/{{ prefetch.status().total }}
            ({{ prefetch.progress() }}%)
          </span>
        </div>
        <div class="cm-prefetch-bar">
          <div class="cm-prefetch-fill" [style.width.%]="prefetch.progress()"></div>
        </div>
        <button class="cm-prefetch-x" (click)="prefetch.cancel()" aria-label="cancelar">×</button>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .cm-prefetch {
      position: fixed;
      left: 16px; right: 16px;
      bottom: 16px;
      z-index: 1080;
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 4px 14px rgba(0,0,0,.18);
      padding: 10px 12px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .cm-prefetch-text {
      flex: 1; min-width: 0;
      display: flex; align-items: center; gap: 6px;
      font-size: 13px; color: #333;
      font-weight: 600;
      flex-wrap: wrap;
    }
    .cm-prefetch-icon {
      font-size: 18px;
      color: #1976d2;
      animation: cm-prefetch-spin 1.6s linear infinite;
    }
    @keyframes cm-prefetch-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .cm-prefetch-count {
      margin-left: auto;
      color: #888;
      font-weight: 400;
      font-variant-numeric: tabular-nums;
    }
    .cm-prefetch-bar {
      flex: 0 0 90px;
      height: 6px;
      background: #e0e0e0;
      border-radius: 3px;
      overflow: hidden;
    }
    .cm-prefetch-fill {
      height: 100%;
      background: linear-gradient(90deg, #1976d2, #42a5f5);
      transition: width .25s ease-out;
    }
    .cm-prefetch-x {
      background: transparent;
      border: none;
      color: #888;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      padding: 0 4px;
    }
    .cm-prefetch-x:hover { color: #333; }
  `],
})
export class PrefetchBannerComponent {
  readonly prefetch = inject(TilePrefetchService);
  readonly i18n = inject(I18nService);
}