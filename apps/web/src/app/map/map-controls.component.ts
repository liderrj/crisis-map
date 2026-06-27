import { Component, output, inject } from '@angular/core';
import { I18nService } from '../core/i18n.service';

@Component({
  selector: 'app-map-controls',
  standalone: true,
  template: `
    <button class="cm-fab cm-fab-contact" (click)="contact.emit()" [attr.aria-label]="'Contact'">✉</button>
    <button class="cm-fab cm-fab-report" (click)="report.emit()" [attr.aria-label]="i18n.t('fab.report')">＋</button>
    <button class="cm-fab cm-fab-loc" (click)="locate.emit()" [attr.aria-label]="i18n.t('fab.locate')">⊕</button>
    <button class="cm-fab cm-fab-filter" (click)="filters.emit()" [attr.aria-label]="i18n.t('fab.filters')">☰</button>
    <button class="cm-fab cm-fab-legend" (click)="legend.emit()" [attr.aria-label]="i18n.t('fab.legend')">i</button>
    <button class="cm-fab cm-fab-resources" (click)="resources.emit()" [attr.aria-label]="i18n.t('fab.resources')">⛓</button>
    <button class="cm-fab cm-fab-terms" (click)="terms.emit()" [attr.aria-label]="i18n.t('fab.terms')">§</button>
    <button class="cm-fab cm-fab-lang" (click)="toggleLang.emit()" [attr.aria-label]="i18n.t('fab.language')">{{ langLabel }}</button>
  `,
  styles: [`
    .cm-fab { position: fixed; right: 16px; width: 56px; height: 56px; border-radius: 50%;
      border: none; background: #fff; color: #111; font-size: 22px; font-weight: 700;
      box-shadow: 0 2px 8px rgba(0,0,0,.3); cursor: pointer; z-index: 1000; }
    .cm-fab-report { bottom: 96px; background: #d32f2f; color: #fff; font-size: 32px; }
    .cm-fab-loc { bottom: 162px; }
    .cm-fab-filter { bottom: 228px; }
    .cm-fab-legend { bottom: 294px; }
    .cm-fab-resources { bottom: 360px; font-size: 22px; }
    .cm-fab-terms { bottom: 426px; font-size: 22px; background: #424242; color: #fff; }
    .cm-fab-lang { bottom: 492px; font-size: 13px; background: #1976d2; color: #fff; letter-spacing: 0.5px; }
    .cm-fab-contact { bottom: 558px; font-size: 22px; background: #00838f; color: #fff; }
  `],
})
export class MapControlsComponent {
  readonly i18n = inject(I18nService);
  readonly report = output<void>();
  readonly locate = output<void>();
  readonly filters = output<void>();
  readonly legend = output<void>();
  readonly resources = output<void>();
  readonly terms = output<void>();
  readonly toggleLang = output<void>();
  readonly contact = output<void>();

  get langLabel(): string {
    const l = this.i18n.locale();
    return l === 'es' ? 'ES' : l === 'en' ? 'EN' : 'PT';
  }
}
