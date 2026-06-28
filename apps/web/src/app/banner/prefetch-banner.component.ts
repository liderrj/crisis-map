import { Component, inject } from '@angular/core';
import { TilePrefetchService } from '../core/tile-prefetch.service';
import { I18nService } from '../core/i18n.service';

@Component({
  selector: 'app-prefetch-banner',
  standalone: true,
  template: `
    @if (prefetch.visible()) {
      <div class="cm-prefetch" role="status">
        <svg class="cm-prefetch-spinner" viewBox="0 0 50 50" aria-hidden="true">
          <circle class="cm-prefetch-track" cx="25" cy="25" r="20" />
          <circle class="cm-prefetch-arc" cx="25" cy="25" r="20" />
        </svg>
        <div class="cm-prefetch-body">
          <div class="cm-prefetch-text">
            <span>{{ i18n.t('prefetch.title') }}</span>
            <span class="cm-prefetch-count">
              {{ prefetch.status().done }}/{{ prefetch.status().total }}
              ({{ prefetch.progress() }}%)
            </span>
          </div>
          <div class="cm-prefetch-bar">
            <div class="cm-prefetch-fill" [style.width.%]="prefetch.progress()"></div>
          </div>
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
    .cm-prefetch-body {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 4px;
    }
    .cm-prefetch-text {
      display: flex; align-items: center; gap: 6px;
      font-size: 13px; color: #333;
      font-weight: 600;
    }
    .cm-prefetch-spinner {
      flex: 0 0 auto;
      width: 28px; height: 28px;
      animation: cm-prefetch-rotate 1.1s linear infinite;
    }
    .cm-prefetch-track {
      fill: none;
      stroke: #e0e0e0;
      stroke-width: 5;
    }
    .cm-prefetch-arc {
      fill: none;
      stroke: #1976d2;
      stroke-width: 5;
      stroke-linecap: round;
      stroke-dasharray: 80 200;
      stroke-dashoffset: 0;
      transform-origin: 50% 50%;
      transform: rotate(-90deg);
      animation: cm-prefetch-dash 1.4s ease-in-out infinite;
    }
    @keyframes cm-prefetch-rotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes cm-prefetch-dash {
      0%   { stroke-dasharray: 1 200; stroke-dashoffset: 0; }
      50%  { stroke-dasharray: 100 200; stroke-dashoffset: -35; }
      100% { stroke-dasharray: 100 200; stroke-dashoffset: -124; }
    }
    @media (prefers-reduced-motion: reduce) {
      .cm-prefetch-spinner { animation-duration: 3s; }
      .cm-prefetch-arc { animation: none; }
    }
    .cm-prefetch-count {
      margin-left: auto;
      color: #888;
      font-weight: 400;
      font-variant-numeric: tabular-nums;
    }
    .cm-prefetch-bar {
      width: 100%;
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