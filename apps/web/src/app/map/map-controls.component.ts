import { Component, output } from '@angular/core';

@Component({
  selector: 'app-map-controls',
  standalone: true,
  template: `
    <button class="cm-fab cm-fab-report" (click)="report.emit()" aria-label="Report">＋</button>
    <button class="cm-fab cm-fab-loc" (click)="locate.emit()" aria-label="My location">⊕</button>
    <button class="cm-fab cm-fab-filter" (click)="filters.emit()" aria-label="Filters">☰</button>
    <button class="cm-fab cm-fab-legend" (click)="legend.emit()" aria-label="Legend">i</button>
    <button class="cm-fab cm-fab-resources" (click)="resources.emit()" aria-label="Recursos externos">⛓</button>
  `,
  styles: [`
    .cm-fab { position: fixed; right: 16px; width: 56px; height: 56px; border-radius: 50%;
      border: none; background: #fff; color: #111; font-size: 26px; font-weight: 700;
      box-shadow: 0 2px 8px rgba(0,0,0,.3); cursor: pointer; z-index: 1000; }
    .cm-fab-report { bottom: 96px; background: #d32f2f; color: #fff; font-size: 32px; }
    .cm-fab-loc { bottom: 162px; }
    .cm-fab-filter { bottom: 228px; }
    .cm-fab-legend { bottom: 294px; }
    .cm-fab-resources { bottom: 360px; font-size: 22px; }
  `],
})
export class MapControlsComponent {
  readonly report = output<void>();
  readonly locate = output<void>();
  readonly filters = output<void>();
  readonly legend = output<void>();
  readonly resources = output<void>();
}
