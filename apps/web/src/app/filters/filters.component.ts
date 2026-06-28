import { Component, input, output, signal, inject, OnInit } from '@angular/core';
import type { IncidentCategory } from '../shared/constants';
import { CATEGORY_LABELS } from '../shared/constants';
import { I18nService } from '../core/i18n.service';
import type { FilterState } from '../map/incident-layer.service';

@Component({
  selector: 'app-filters',
  standalone: true,
  template: `
    <div class="cm-panel" (click)="$event.stopPropagation()">
      <h3>{{ i18n.t('filters.title') }}</h3>
      @for (c of categories; track c) {
        <label><input type="checkbox" [checked]="sel().categories.has(c)"
          (change)="toggleCat(c)" />{{ i18n.t('cat.' + c) }}</label>
      }
      <label><input type="checkbox" [checked]="sel().confirmedOnly"
        (change)="toggleConfirmed($event)" />{{ i18n.t('filters.confirmedOnly') }}</label>
      <button class="cm-btn" (click)="apply()">{{ i18n.t('filters.apply') }}</button>
      <button class="cm-btn cm-btn-ghost" (click)="close.emit()">{{ i18n.t('filters.close') }}</button>
    </div>
  `,
  styles: [`
    .cm-panel { position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
      background: #fff; padding: 16px; border-radius: 12px; z-index: 1100; min-width: 260px;
      box-shadow: 0 4px 20px rgba(0,0,0,.3); display: flex; flex-direction: column; gap: 8px; }
    h3 { margin: 0 0 8px; }
    label { display: flex; align-items: center; gap: 8px; font-size: 16px; padding: 4px 0; }
    .cm-btn { margin-top: 8px; padding: 12px; font-size: 16px; border: none; border-radius: 8px;
      background: #1976d2; color: #fff; cursor: pointer; }
    .cm-btn-ghost { background: #eee; color: #333; }
  `],
})
export class FiltersComponent implements OnInit {
  readonly i18n = inject(I18nService);
  readonly applyFilters = output<FilterState>();
  readonly close = output<void>();
  readonly current = input<FilterState>({ categories: new Set(), confirmedOnly: false, types: new Set() });
  readonly sel = signal<FilterState>({ categories: new Set(), confirmedOnly: false, types: new Set() });
  readonly categories: IncidentCategory[] = ['emergency', 'infrastructure', 'service_interruption', 'resource', 'communications'];

  ngOnInit(): void {
    const c = this.current();
    this.sel.set({
      categories: new Set(c.categories),
      confirmedOnly: c.confirmedOnly,
      types: new Set(c.types),
    });
  }

  toggleCat(c: IncidentCategory): void {
    const s = this.sel();
    const cats = new Set(s.categories);
    cats.has(c) ? cats.delete(c) : cats.add(c);
    this.sel.set({ ...s, categories: cats });
  }

  toggleConfirmed(e: Event): void {
    const checked = (e.target as HTMLInputElement).checked;
    this.sel.update((s) => ({ ...s, confirmedOnly: checked }));
  }

  apply(): void {
    this.applyFilters.emit(this.sel());
    this.close.emit();
  }

  labels(): Record<IncidentCategory, string> { return CATEGORY_LABELS; }
}
