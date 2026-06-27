import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, inject, signal } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { IncidentLayerService, type FilterState } from './incident-layer.service';
import { incidentMarkerIcon, incidentPopupNode } from './marker-style';
import { I18nService } from '../core/i18n.service';
import type { Incident } from '../shared/constants';

// Approximate bounding box of continental Venezuela (inclusive of Caracas,
// La Guaira, Maracaibo, Mérida, Ciudad Guayana; excludes only deep offshore).
// Used as a "is the user in Venezuela?" check before requesting device GPS.
const VENEZUELA_BBOX = { minLat: 0.65, maxLat: 12.25, minLng: -72.5, maxLng: -59.5 };
const VZ_CENTER: L.LatLngTuple = [10.483, -66.833];
const VZ_INITIAL_ZOOM = 11;

@Component({
  selector: 'app-map',
  standalone: true,
  template: `<div #mapEl class="cm-map"></div>`,
  styles: [`.cm-map { position: absolute; inset: 0; z-index: 0; }`],
})
export class MapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;
  private layer = inject(IncidentLayerService);
  private i18n = inject(I18nService);
  private map!: L.Map;
  private clusterGroup!: L.MarkerClusterGroup;
  readonly filters = signal<FilterState>({
    categories: new Set(),
    confirmedOnly: false,
    types: new Set(),
  });
  private debounceTimer?: ReturnType<typeof setTimeout>;

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement, { zoomControl: false }).setView(VZ_CENTER, VZ_INITIAL_ZOOM);
    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(this.map);

    this.clusterGroup = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
    this.map.addLayer(this.clusterGroup);

    this.map.on('moveend zoomend', () => this.refresh());
    this.loadCached();
  }

  private async loadCached(): Promise<void> {
    const cached = await this.layer.getCached();
    if (cached.length) this.render(cached);
  }

  /**
   * "Mi ubicación" behavior:
   * - If the user grants geolocation AND is inside the Venezuela bounding box,
   *   center the map on them at zoom 15.
   * - Otherwise (denied, unavailable, or outside Venezuela), keep the default
   *   Venezuela focus. We do NOT silently recenter on a non-Venezuelan user;
   *   this app is currently scoped to the Venezuelan crisis response.
   */
  locate(): void {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (this.isInVenezuela(lat, lng)) {
          this.map.setView([lat, lng], 15);
        }
        // else: silently keep the Venezuela view
      },
      () => { /* denied or unavailable: keep the Venezuela view */ },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  private isInVenezuela(lat: number, lng: number): boolean {
    return lat >= VENEZUELA_BBOX.minLat
      && lat <= VENEZUELA_BBOX.maxLat
      && lng >= VENEZUELA_BBOX.minLng
      && lng <= VENEZUELA_BBOX.maxLng;
  }

  private refresh(): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      const b = this.map.getBounds();
      const bbox = this.layer.bboxFromBounds({
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
      });
      let incidents: Incident[] = [];
      try {
        incidents = await this.layer.loadBbox(bbox, this.filters());
        this.render(incidents);
      } catch {
        // Server unreachable or query timed out: fall back to whatever
        // we have in IndexedDB. This prevents the map from "emptying out"
        // when the backend can't handle a large bbox in time.
        try {
          const cached = await this.layer.getCached();
          this.render(cached);
        } catch {
          // No cache available either; keep whatever is currently shown.
        }
      }
    }, 350);
  }

  render(incidents: Incident[]): void {
    this.clusterGroup.clearLayers();
    for (const incident of incidents) {
      const typeLabel = this.i18n.t('type.' + incident.type) || incident.type;
      const marker = L.marker([incident.location.lat, incident.location.lng], {
        icon: incidentMarkerIcon(incident, typeLabel),
      }).bindPopup(incidentPopupNode(incident, (k) => this.i18n.t(k)));
      this.clusterGroup.addLayer(marker);
    }
  }

  setFilters(f: FilterState): void {
    this.filters.set(f);
    this.refresh();
  }

  ngOnDestroy(): void {
    clearTimeout(this.debounceTimer);
    this.map?.remove();
  }
}
