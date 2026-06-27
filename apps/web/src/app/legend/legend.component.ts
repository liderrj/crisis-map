import { Component, inject, output, signal, OnInit } from '@angular/core';
import { ApiClientService } from '../core/api-client.service';
import { CATEGORY_LABELS, CATEGORY_COLOURS } from '../shared/constants';
import { I18nService } from '../core/i18n.service';

@Component({
  selector: 'app-legend',
  standalone: true,
  template: `
    <div class="cm-legend" (click)="$event.stopPropagation()">
      <h3>{{ i18n.t('legend.title') }}</h3>
      @for (item of items(); track item.colour) {
        <div class="cm-leg-row">
          <span class="cm-leg-dot" [style.background]="item.colour"></span>
          <span>{{ item.label }}</span>
        </div>
      }
      <button class="cm-btn" (click)="close.emit()">{{ i18n.t('legend.close') }}</button>
    </div>
  `,
  styles: [`
    .cm-legend { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
      background: #fff; padding: 16px; border-radius: 12px; z-index: 1100; min-width: 240px;
      box-shadow: 0 4px 20px rgba(0,0,0,.3); }
    h3 { margin: 0 0 12px; }
    .cm-leg-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 16px; }
    .cm-leg-dot { width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; }
    .cm-btn { margin-top: 12px; width: 100%; padding: 12px; font-size: 16px; border: none;
      border-radius: 8px; background: #1976d2; color: #fff; cursor: pointer; }
  `],
})
export class LegendComponent implements OnInit {
  readonly i18n = inject(I18nService);
  readonly close = output<void>();
  private api = inject(ApiClientService);
  readonly items = signal<{ colour: string; label: string }[]>(
    Object.keys(CATEGORY_COLOURS).map((c) => ({
      colour: CATEGORY_COLOURS[c as keyof typeof CATEGORY_COLOURS],
      label: this.i18n.t('cat.' + c),
    })),
  );

  async ngOnInit(): Promise<void> {
    this.items.set(
      Object.keys(CATEGORY_COLOURS).map((c) => ({
        colour: CATEGORY_COLOURS[c as keyof typeof CATEGORY_COLOURS],
        label: this.i18n.t('cat.' + c),
      })),
    );
    try {
      const legend = await this.api.getLegend();
      if (legend.length) {
        this.items.set(legend.map((l) => ({ colour: l.colour, label: CATEGORY_LABELS[l.colour as keyof typeof CATEGORY_LABELS] ?? l.label })));
      }
    } catch {
      // keep defaults
    }
  }
}