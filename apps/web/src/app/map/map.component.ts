import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, inject, signal, output } from '@angular/core';
import { IncidentLayerService, type FilterState } from './incident-layer.service';
import { incidentMarkerIcon, incidentPopupNode, renderPopupImages, pendingMarkerIcon } from './marker-style';
import { I18nService } from '../core/i18n.service';
import { ApiClientService } from '../core/api-client.service';
import { NetworkService } from '../core/network.service';
import { SyncEngineService } from '../core/sync-engine.service';
import { DISASTER_ZONE, type Incident } from '../shared/constants';

const VENEZUELA_BBOX = { minLat: 0.65, maxLat: 12.25, minLng: -72.5, maxLng: -59.5 };
const VZ_INITIAL_ZOOM = 11;
const REFRESH_DEBOUNCE_MS = 1500;
const PENDING_REFRESH_MS = 2000;
const VIEWPORT_QUANTIZE_DEG = 0.01;

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
  private api = inject(ApiClientService);
  private network = inject(NetworkService);
  private sync = inject(SyncEngineService);
  private map!: L.Map;
  private clusterGroup!: L.MarkerClusterGroup;
  private markers = new Map<string, { marker: L.Marker; signature: string; pending: boolean }>();
  private openIncidentId = '';
  readonly filters = signal<FilterState>({
    categories: new Set(),
    confirmedOnly: false,
    types: new Set(),
  });
  readonly incidentSelected = output<Incident & { __pending?: boolean }>();
  readonly pendingChanged = output<void>();

  private debounceTimer?: ReturnType<typeof setTimeout>;
  private pendingTimer?: ReturnType<typeof setInterval>;
  private inFlight = false;
  private lastViewport = '';

  ngAfterViewInit(): void {
    // Start centered on the disaster zone so the prefetched tiles are
    // immediately visible even before GPS resolves. We then try to
    // re-center on the user if they're inside Venezuela.
    this.map = L.map(this.mapEl.nativeElement, { zoomControl: false }).setView(
      DISASTER_ZONE.center as L.LatLngTuple,
      DISASTER_ZONE.zoom,
    );
    L.control.zoom({ position: 'topright' }).addTo(this.map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(this.map);

    this.clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 50,
      animate: false,
      animateAddingMarkers: false,
      removeOutsideVisibleBounds: false,
    });
    this.map.addLayer(this.clusterGroup);

    this.map.on('moveend zoomend', () => this.scheduleRefresh());
    this.loadCached();

    // Async: try to find the user. If they're in Venezuela, re-center
    // there. If GPS fails or they're abroad, keep the disaster-zone view.
    this.tryCenterOnUser();

    // Periodically re-render pending markers so they refresh after sync.
    this.pendingTimer = setInterval(() => {
      void this.refreshPending();
    }, PENDING_REFRESH_MS);

    // When network comes back, attempt to refresh pending state.
    window.addEventListener('online', () => {
      void this.refreshPending();
    });
  }

  private async tryCenterOnUser(): Promise<void> {
    if (!navigator.geolocation) return;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 6000,
          maximumAge: 60000,
        });
      });
      const { latitude, longitude } = pos.coords;
      if (!this.isInVenezuela(latitude, longitude)) return;
      this.map.setView([latitude, longitude], 14, { animate: true });
    } catch {
      /* keep disaster-zone view */
    }
  }

  /** Public: re-center the map on the disaster zone (called by FAB). */
  centerOnDisasterZone(): void {
    this.map.setView(DISASTER_ZONE.center as L.LatLngTuple, DISASTER_ZONE.zoom, { animate: true });
  }

  private scheduleRefresh(): void {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      if (this.inFlight) return;
      this.inFlight = true;

      const b = this.map.getBounds();
      const viewportKey = this.viewportKey(b);
      if (viewportKey === this.lastViewport) {
        this.inFlight = false;
        return;
      }
      this.lastViewport = viewportKey;

      const bbox = this.layer.bboxFromBounds({
        west: b.getWest(),
        south: b.getSouth(),
        east: b.getEast(),
        north: b.getNorth(),
      });

      try {
        const result = await this.layer.loadBbox(bbox, this.filters(), (fresh) => {
          this.render(fresh);
        });
        const pending = await this.layer.getPendingIncidents();
        const confirmed = result.incidents.filter((i) => !(i as Incident & { __pending?: boolean }).__pending);
        const allToRender = [...pending, ...confirmed];
        if (allToRender.length > 0) {
          this.render(allToRender);
        }
      } catch {
        try {
          const cached = await this.layer.getCached();
          if (cached.length > 0) this.render(cached);
        } catch { }
      } finally {
        this.inFlight = false;
      }
    }, REFRESH_DEBOUNCE_MS);
  }

  private async refreshPending(): Promise<void> {
    const pending = await this.layer.getPendingIncidents();
    const current = Array.from(this.markers.values()).filter((m) => m.pending);
    const pendingIds = new Set(pending.map((p) => p.incidentId));

    let changed = false;
    for (const m of current) {
      const id = (m.marker as L.Marker & { __pendingId?: string }).__pendingId;
      if (id && !pendingIds.has(id)) {
        this.clusterGroup.removeLayer(m.marker);
        this.markers.delete(id);
        changed = true;
      }
    }

    if (changed) {
      // Pending markers were resolved by sync. Reload all cached data so
      // newly-confirmed incidents (with server IDs) appear on the map.
      const cached = await this.layer.getCached();
      const confirmed = cached.filter((i) => !(i as Incident & { __pending?: boolean }).__pending);
      const allToRender = [...pending, ...confirmed];
      if (allToRender.length > 0) this.render(allToRender);
    } else if (pending.length > 0) {
      this.render(pending);
    }
    this.pendingChanged.emit();
  }

  private async loadCached(): Promise<void> {
    const cached = await this.layer.getCached();
    const pending = await this.layer.getPendingIncidents();
    if (cached.length || pending.length) {
      this.render([...pending, ...cached]);
    }
  }

  locate(): void {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (this.isInVenezuela(lat, lng)) {
          this.map.setView([lat, lng], 15);
        }
      },
      () => { },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  private isInVenezuela(lat: number, lng: number): boolean {
    return lat >= VENEZUELA_BBOX.minLat
      && lat <= VENEZUELA_BBOX.maxLat
      && lng >= VENEZUELA_BBOX.minLng
      && lng <= VENEZUELA_BBOX.maxLng;
  }

  render(incidents: (Incident & { __pending?: boolean })[]): void {
    const nextIds = new Set(incidents.map((i) => i.incidentId));
    let shouldRestorePopup = false;

    for (const [incidentId, entry] of this.markers.entries()) {
      if (!nextIds.has(incidentId)) {
        if (incidentId === this.openIncidentId) this.openIncidentId = '';
        this.clusterGroup.removeLayer(entry.marker);
        this.markers.delete(incidentId);
      }
    }

    for (const incident of incidents) {
      const signature = this.markerSignature(incident);
      const isPending = incident.__pending === true;
      const existing = this.markers.get(incident.incidentId);

      if (existing && existing.signature === signature && existing.pending === isPending) {
        continue;
      }

      if (existing) {
        if (incident.incidentId === this.openIncidentId) shouldRestorePopup = true;
        this.clusterGroup.removeLayer(existing.marker);
      }

      const typeLabel = this.i18n.t('type.' + incident.type) || incident.type;
      const icon = isPending
        ? pendingMarkerIcon(incident, typeLabel)
        : incidentMarkerIcon(incident, typeLabel);
      const marker = L.marker([incident.location.lat, incident.location.lng], { icon })
        .bindPopup(incidentPopupNode(incident, (k) => this.i18n.t(k)));
      (marker as L.Marker & { __pendingId?: string }).__pendingId = incident.incidentId;

      marker.on('popupopen', (e) => {
        this.openIncidentId = incident.incidentId;
        this.loadPopupImages(incident.incidentId);
        const el = (e.popup.getElement?.() ?? null) as HTMLElement | null;
        const btn = el?.querySelector<HTMLButtonElement>(`[data-view-details="${incident.incidentId}"]`);
        if (btn && !btn.dataset['wired']) {
          btn.dataset['wired'] = '1';
          btn.addEventListener('click', () => {
            marker.closePopup();
            this.incidentSelected.emit(incident);
          });
        }
      });
      marker.on('popupclose', () => {
        if (this.openIncidentId === incident.incidentId) this.openIncidentId = '';
      });
      this.clusterGroup.addLayer(marker);
      this.markers.set(incident.incidentId, { marker, signature, pending: isPending });

      if (incident.incidentId === this.openIncidentId) shouldRestorePopup = true;
    }

    if (shouldRestorePopup && this.openIncidentId) {
      queueMicrotask(() => {
        const entry = this.markers.get(this.openIncidentId);
        entry?.marker.openPopup();
      });
    }
  }

  private async loadPopupImages(incidentId: string): Promise<void> {
    const entry = this.markers.get(incidentId);
    if (!entry) return;
    const popup = entry.marker.getPopup();
    if (!popup) return;
    const el = popup.getElement();
    if (!el) return;
    const container = el.querySelector<HTMLElement>(`.cm-pop-images[data-incident-id="${incidentId}"]`);
    if (!container) return;

    try {
      const keys = await this.api.listImages(incidentId);
      if (this.openIncidentId !== incidentId) return;
      if (keys.length) {
        renderPopupImages(container, keys);
      } else {
        container.textContent = this.i18n.t('incident.noImages') || 'Sin fotos';
      }
    } catch {
      if (this.openIncidentId === incidentId) {
        container.textContent = this.i18n.t('incident.noImages') || 'Sin fotos';
      }
    }
  }

  private viewportKey(bounds: L.LatLngBounds): string {
    return [
      this.quantize(bounds.getWest()),
      this.quantize(bounds.getSouth()),
      this.quantize(bounds.getEast()),
      this.quantize(bounds.getNorth()),
    ].join(',');
  }

  private quantize(value: number): string {
    return (Math.round(value / VIEWPORT_QUANTIZE_DEG) * VIEWPORT_QUANTIZE_DEG).toFixed(3);
  }

  private markerSignature(incident: Incident & { __pending?: boolean }): string {
    return [
      incident.incidentId,
      incident.type,
      incident.confirmations,
      incident.negativeVotes,
      incident.status,
      incident.location.lat,
      incident.location.lng,
      incident.updatedAt,
      incident.__pending ? '1' : '0',
    ].join('|');
  }

  setFilters(f: FilterState): void {
    this.filters.set(f);
    this.lastViewport = '';
    this.scheduleRefresh();
  }

  ngOnDestroy(): void {
    clearTimeout(this.debounceTimer);
    if (this.pendingTimer) clearInterval(this.pendingTimer);
    this.markers.clear();
    this.map?.remove();
  }
}
