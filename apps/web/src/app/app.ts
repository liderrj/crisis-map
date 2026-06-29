import { Component, signal, inject, ViewChild, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MapComponent } from './map/map.component';
import { MapControlsComponent } from './map/map-controls.component';
import { FiltersComponent } from './filters/filters.component';
import { LegendComponent } from './legend/legend.component';
import { ReportFormComponent } from './report/report-form.component';
import { DuplicatePromptComponent } from './report/duplicate-prompt.component';
import { IncidentDetailComponent } from './incident/incident-detail.component';
import { IncidentListComponent } from './incident/incident-list.component';
import { BannerTrayComponent } from './banner/banner-tray.component';
import { PrefetchBannerComponent } from './banner/prefetch-banner.component';
import { ResourcesComponent } from './resources/resources.component';
import { TermsComponent } from './terms/terms.component';
import { ContactComponent } from './contact/contact.component';
import { SyncEngineService } from './core/sync-engine.service';
import { SeedService } from './core/seed.service';
import { TilePrefetchService } from './core/tile-prefetch.service';
import { I18nService } from './core/i18n.service';
import { DeviceIdService } from './core/device-id.service';
import { VersionCheckService } from './core/version-check.service';
import type { FilterState } from './map/incident-layer.service';
import type { Incident, IncidentCategory, IncidentType } from './shared/constants';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    FormsModule,
    MapComponent,
    MapControlsComponent,
    FiltersComponent,
    LegendComponent,
    ReportFormComponent,
    DuplicatePromptComponent,
    IncidentDetailComponent,
    IncidentListComponent,
    BannerTrayComponent,
    PrefetchBannerComponent,
    ResourcesComponent,
    TermsComponent,
    ContactComponent,
  ],
  template: `
<app-banner-tray />
    <app-map #map (incidentSelected)="onIncidentSelected($event)" />
    <app-map-controls
      (report)="onReport()"
      (locate)="onLocate()"
      (disasterZone)="onDisasterZone()"
      (filters)="showFilters.set(true)"
      (legend)="showLegend.set(true)"
      (list)="showList.set(true)"
      (resources)="showResources.set(true)"
      (terms)="showTerms.set(true)"
      (contact)="showContact.set(true)"
      (setLocale)="i18n.setLocale($event)"
    />
    <app-prefetch-banner />

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
        [current]="filtersState()"
        (applyFilters)="onFilters($event)"
        (close)="showFilters.set(false)"
      />
    }

    @if (showList()) {
      <app-incident-list
        (close)="showList.set(false)"
        (selectIncident)="selectedIncident.set($event)"
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

    @if (showAlias()) {
      <div class="cm-alias-bg">
        <div class="cm-alias-box">
          <h2>{{ i18n.t('alias.title') }}</h2>
          <p>{{ i18n.t('alias.body') }}</p>
          <input class="cm-alias-input" [(ngModel)]="aliasValue" [placeholder]="i18n.t('alias.placeholder')" maxlength="30" (keydown.enter)="saveAlias()" />
          @if (aliasError()) { <p class="cm-alias-err">{{ aliasError() }}</p> }
          <button class="cm-alias-btn" (click)="saveAlias()">{{ i18n.t('alias.save') }}</button>
        </div>
      </div>
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
    .cm-alias-bg { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 1400;
      display: flex; align-items: center; justify-content: center; }
    .cm-alias-box { background: #fff; border-radius: 14px; padding: 28px 24px;
      max-width: 360px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,.2);
      text-align: center; }
    .cm-alias-box h2 { margin: 0 0 8px; font-size: 20px; }
    .cm-alias-box p { margin: 0 0 16px; font-size: 14px; color: #555; line-height: 1.4; }
    .cm-alias-input { width: 100%; box-sizing: border-box; padding: 12px;
      font-size: 18px; border: 2px solid #ccc; border-radius: 8px; text-align: center; }
    .cm-alias-err { color: #c62828; font-size: 13px; margin: 6px 0 0; }
    .cm-alias-btn { margin-top: 14px; width: 100%; padding: 14px; font-size: 16px;
      font-weight: 700; border: none; border-radius: 8px;
      background: #1976d2; color: #fff; cursor: pointer; }
    .cm-alias-btn:hover { background: #1565c0; }
  `],
})
export class App {
  @ViewChild('map') mapComp?: MapComponent;
  private sync = inject(SyncEngineService);
  private seed = inject(SeedService);
  private prefetch = inject(TilePrefetchService);
  private device = inject(DeviceIdService);
  private version = inject(VersionCheckService);
  readonly i18n = inject(I18nService);

  readonly filtersState = signal<FilterState>({ categories: new Set<IncidentCategory>(), confirmedOnly: false, types: new Set<IncidentType>() });
  readonly showReport = signal(false);
  readonly showFilters = signal(false);
  readonly showLegend = signal(false);
  readonly showList = signal(false);
  readonly showResources = signal(false);
  readonly showTerms = signal(false);
  readonly showContact = signal(false);
  readonly duplicateId = signal('');
  readonly selectedIncident = signal<Incident | null>(null);

  readonly showAlias = signal(false);
  readonly aliasError = signal('');
  aliasValue = '';

  constructor() {
    this.sync.start();
    void this.seed.seedIfNeeded();
    if (!this.device.device().alias) {
      this.showAlias.set(true);
    }
    this.prefetch.prefetchIfNeeded();
    this.version.start();
  }

  onReport(): void {
    if (!this.device.device().alias) {
      this.showAlias.set(true);
      return;
    }
    this.showReport.set(true);
  }

  saveAlias(): void {
    const v = this.aliasValue.trim();
    if (!v) {
      this.aliasError.set(this.i18n.t('alias.required'));
      return;
    }
    this.aliasError.set('');
    this.device.setAlias(v);
    this.showAlias.set(false);
  }

  openAlias(): void {
    this.aliasValue = this.device.device().alias;
    this.showAlias.set(true);
  }

  onLocate(): void {
    this.mapComp?.locate();
  }

  onDisasterZone(): void {
    this.mapComp?.centerOnDisasterZone();
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
    this.filtersState.set(f);
    this.mapComp?.setFilters(f);
  }

  onIncidentSelected(incident: Incident): void {
    this.selectedIncident.set(incident);
  }
}
