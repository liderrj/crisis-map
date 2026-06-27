import { Component, signal, inject, ViewChild } from '@angular/core';
import { MapComponent } from './map/map.component';
import { MapControlsComponent } from './map/map-controls.component';
import { FiltersComponent } from './filters/filters.component';
import { LegendComponent } from './legend/legend.component';
import { ReportFormComponent } from './report/report-form.component';
import { DuplicatePromptComponent } from './report/duplicate-prompt.component';
import { IncidentDetailComponent } from './incident/incident-detail.component';
import { QuakeBannerComponent } from './banner/quake-banner.component';
import { ResourcesComponent } from './resources/resources.component';
import { TermsComponent } from './terms/terms.component';
import { ContactComponent } from './contact/contact.component';
import { SyncEngineService } from './core/sync-engine.service';
import { SeedService } from './core/seed.service';
import { I18nService } from './core/i18n.service';
import type { FilterState } from './map/incident-layer.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    MapComponent,
    MapControlsComponent,
    FiltersComponent,
    LegendComponent,
    ReportFormComponent,
    DuplicatePromptComponent,
    IncidentDetailComponent,
    QuakeBannerComponent,
    ResourcesComponent,
    TermsComponent,
    ContactComponent,
  ],
  template: `
    <app-quake-banner />
    <app-map />
    <app-map-controls
      (report)="onReport()"
      (locate)="onLocate()"
      (filters)="showFilters.set(true)"
      (legend)="showLegend.set(true)"
      (resources)="showResources.set(true)"
      (terms)="showTerms.set(true)"
      (contact)="showContact.set(true)"
      (setLocale)="i18n.setLocale($event)"
    />

    @if (showReport()) {
      <app-report-form
        (submitted)="onSubmitted()"
        (cancel)="showReport.set(false)"
        (duplicate)="onDuplicate($event)"
      />
    }

    @if (duplicateId()) {
      <app-duplicate-prompt
        [incidentId]="duplicateId()"
        (createNew)="duplicateId.set('')"
        (resolved)="duplicateId.set(''); onSubmitted()"
      />
    }

    @if (showFilters()) {
      <div class="cm-backdrop" (click)="showFilters.set(false)"></div>
      <app-filters
        (applyFilters)="onFilters($event)"
        (close)="showFilters.set(false)"
      />
    }

    @if (showLegend()) {
      <div class="cm-backdrop" (click)="showLegend.set(false)"></div>
      <app-legend (close)="showLegend.set(false)" />
    }

    @if (showResources()) {
      <app-resources (close)="showResources.set(false)" />
    }

    @if (showContact()) {
      <app-contact (close)="showContact.set(false)" />
    }

    @if (showTerms()) {
      <app-terms (close)="showTerms.set(false)" />
    }

    @if (selectedIncident()) {
      <app-incident-detail
        [incident]="selectedIncident()"
        (close)="selectedIncident.set(null)"
      />
    }
  `,
  styles: [`
    .cm-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 1050; }
  `],
})
export class App {
  @ViewChild(MapComponent) mapComp?: MapComponent;
  private sync = inject(SyncEngineService);
  private seed = inject(SeedService);
  readonly i18n = inject(I18nService);

  readonly showReport = signal(false);
  readonly showFilters = signal(false);
  readonly showLegend = signal(false);
  readonly showResources = signal(false);
  readonly showTerms = signal(false);
  readonly showContact = signal(false);
  readonly duplicateId = signal('');
  readonly selectedIncident = signal<{ incidentId: string; type: string; confirmations: number; description?: string } | null>(null);

  constructor() {
    this.sync.start();
    void this.seed.seedIfNeeded();
  }

  onReport(): void {
    this.showReport.set(true);
  }

  onLocate(): void {
    this.mapComp?.locate();
  }

  onSubmitted(): void {
    this.showReport.set(false);
    this.mapComp?.locate();
  }

  onDuplicate(id: string): void {
    this.showReport.set(false);
    this.duplicateId.set(id);
  }

  onFilters(f: FilterState): void {
    this.mapComp?.setFilters(f);
  }
}
