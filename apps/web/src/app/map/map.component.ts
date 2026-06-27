import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, inject, signal } from '@angular/core';
import * as L from 'leaflet';
import 'leaflet.markercluster';
import { IncidentLayerService, type FilterState } from './incident-layer.service';
import { incidentMarkerIcon, incidentPopupNode } from './marker-style';
import type { Incident } from '../shared/constants';

@Component({
  selector: 'app-map',
  standalone: true,
  template: `<div #mapEl class="cm-map"></div>`,
  styles: [`.cm-map { position: absolute; inset: 0; z-index: 0; }`],
})
export class MapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;
  private layer = inject(IncidentLayerService);
  private map!: L.Map;
  private clusterGroup!: L.MarkerClusterGroup;
  readonly filters = signal<FilterState>({
    categories: new Set(),
    confirmedOnly: false,
    types: new Set(),
  });
  private debounceTimer?: ReturnType<typeof setTimeout>;

  ngAfterViewInit(): void {
    this.map = L.map(this.mapEl.nativeElement, { zoomControl: false }).setView([10.483, -66.833], 13);
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

  locate(): void {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => this.map.setView([pos.coords.latitude, pos.coords.longitude], 15),
      () => void 0,
      { enableHighAccuracy: true },
    );
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
      try {
        const incidents = await this.layer.loadBbox(bbox, this.filters());
        this.render(incidents);
      } catch {
        // offline - keep cached
      }
    }, 350);
  }

  render(incidents: Incident[]): void {
    this.clusterGroup.clearLayers();
    for (const incident of incidents) {
      const marker = L.marker([incident.location.lat, incident.location.lng], {
        icon: incidentMarkerIcon(incident),
      }).bindPopup(incidentPopupNode(incident));
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
