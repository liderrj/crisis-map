import { Component, inject, output, signal, computed, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeviceIdService } from '../core/device-id.service';
import { ImageUploadService } from './image-upload.service';
import { StorageService } from '../core/storage.service';
import { SyncEngineService } from '../core/sync-engine.service';
import { I18nService } from '../core/i18n.service';
import { INCIDENT_TYPES, SEVERITIES, categoryForType } from '../shared/constants';
import type { Severity, IncidentType, Incident, IncidentCategory } from '../shared/constants';
import { MAX_DESCRIPTION_LENGTH, MAX_IMAGE_COUNT } from '../shared/constants';
import { environment } from '../../environments/environment';
import { FallbackTileLayer, OSM_ATTRIBUTION } from '../map/fallback-tile-layer';

const NOW_SEC = () => Math.floor(Date.now() / 1000);

@Component({
  selector: 'app-report-form',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="cm-sheet" (click)="typeOpen.set(false)">
      <h2>{{ i18n.t('report.title') }}</h2>

      <div class="cm-map-wrap">
        <div #mapEl class="cm-report-map"></div>
        <p class="cm-map-hint">{{ i18n.t('report.dragPin') }}</p>
      </div>

      <label>{{ i18n.t('report.type') }}
        <div class="cm-type-wrap">
          <button type="button" class="cm-type-btn" (click)="typeOpen.set(!typeOpen()); $event.stopPropagation()">
            <span>{{ selectedLabel() }}</span>
            <span class="cm-arrow">{{ typeOpen() ? '▲' : '▼' }}</span>
          </button>
          @if (typeOpen()) {
            <div class="cm-type-drop" (click)="$event.stopPropagation()">
              @for (t of types; track t.type) {
                <button type="button" class="cm-type-opt" [class.active]="t.type === type"
                  (mousedown)="selectType(t.type); $event.preventDefault()">
                  <span class="cm-type-opt-check">{{ t.type === type ? '✓' : '' }}</span>
                  {{ i18n.t('type.' + t.type) || t.label }}
                </button>
              }
            </div>
          }
        </div>
      </label>
      @if (type === 'other') {
        <label>{{ i18n.t('report.customType') }}
          <input [(ngModel)]="customType" placeholder="Ej: refugio temporal, centro de acopio…" />
        </label>
      }
      <label>{{ i18n.t('report.severity') }}
        <select [(ngModel)]="severity">
          @for (s of severities; track s) { <option [value]="s">{{ i18n.t('report.severity.' + s) }}</option> }
        </select>
      </label>
      <label>{{ i18n.t('report.description') }}
        <textarea [(ngModel)]="description" [maxlength]="maxDesc" rows="2"></textarea>
      </label>
      <label>{{ i18n.t('report.photos', { max: maxImages }) }}
        <div class="cm-photo-area">
          <button type="button" class="cm-photo-btn" (click)="fileInput.click()">{{ i18n.t('report.addPhotos') }}</button>
          <input #fileInput type="file" accept="image/*" multiple (change)="onFiles($event)" />
        </div>
        @if (previews().length) {
          <div class="cm-photo-grid">
            @for (url of previews(); track url; let i = $index) {
              <div class="cm-photo-cell">
                <img [src]="url" alt="" />
                <button type="button" class="cm-photo-del" (click)="removeFile(i)" aria-label="Eliminar foto">×</button>
              </div>
            }
          </div>
        }
      </label>
      @if (submitting()) { <p>{{ i18n.t('report.submitting') }}</p> }
      @if (error()) { <p class="cm-err">{{ error() }}</p> }
      <div class="cm-actions">
        <button class="cm-btn cm-btn-ghost" (click)="cancel.emit()">{{ i18n.t('common.cancel') }}</button>
        <button class="cm-btn" [disabled]="submitting()" (click)="submit()">{{ i18n.t('report.submit') }}</button>
      </div>
    </div>
  `,
  styles: [`
    .cm-sheet { position: fixed; inset: 0; background: #fff; padding: 16px; z-index: 1200;
      display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
    h2 { margin: 0; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 16px; font-weight: 600; }
    select, textarea, input:not([type=file]) { padding: 12px; font-size: 18px; border: 2px solid #ccc; border-radius: 8px; }
    .cm-type-wrap { position: relative; }
    .cm-type-btn { width: 100%; padding: 12px 14px; font-size: 18px; border: 2px solid #ccc;
      border-radius: 8px; background: #fff; cursor: pointer; display: flex;
      align-items: center; justify-content: space-between; gap: 8px; color: #111; }
    .cm-type-btn:active { border-color: #1976d2; }
    .cm-arrow { font-size: 12px; color: #888; flex-shrink: 0; }
    .cm-type-drop { position: absolute; top: 100%; left: 0; right: 0; z-index: 5;
      background: #fff; border: 2px solid #ccc; border-radius: 8px; margin-top: 4px;
      max-height: 240px; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,.12); }
    .cm-type-opt { width: 100%; padding: 12px 14px; border: none; background: transparent;
      text-align: left; font-size: 16px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
    .cm-type-opt:hover, .cm-type-opt.active { background: #e3f2fd; }
    .cm-type-opt.active { font-weight: 600; color: #1565c0; }
    .cm-type-opt-check { width: 16px; font-weight: 700; color: #2e7d32; flex: 0 0 auto; }
    .cm-map-wrap { border-radius: 8px; overflow: hidden; border: 2px solid #ccc; }
    .cm-report-map { height: 45vh; min-height: 280px; max-height: 420px; }
    .cm-map-hint { margin: 4px 0 0; font-size: 12px; color: #888; text-align: center; font-weight: 400; }
    .cm-actions { display: flex; gap: 12px; margin-top: auto; }
    .cm-btn { flex: 1; padding: 16px; font-size: 18px; border: none; border-radius: 8px;
      background: #d32f2f; color: #fff; cursor: pointer; }
    .cm-btn-ghost { background: #eee; color: #333; }
    .cm-btn:disabled { opacity: .5; }
    .cm-err { color: #d32f2f; }
    .cm-photo-area { display: flex; gap: 8px; align-items: center; }
    .cm-photo-area input[type=file] { display: none; }
    .cm-photo-btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px;
      font-size: 15px; font-weight: 600; border: 2px dashed #aaa; border-radius: 8px;
      background: transparent; color: #555; cursor: pointer; }
    .cm-photo-btn:hover { border-color: #1976d2; color: #1976d2; background: #e3f2fd; }
    .cm-photo-grid { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .cm-photo-cell { position: relative; width: 80px; height: 80px; border-radius: 6px;
      overflow: hidden; border: 1px solid #ddd; flex: 0 0 auto; }
    .cm-photo-cell img { width: 100%; height: 100%; object-fit: cover; }
    .cm-photo-del { position: absolute; top: 2px; right: 2px; width: 22px; height: 22px;
      border-radius: 50%; border: none; background: rgba(0,0,0,.55); color: #fff;
      font-size: 15px; line-height: 1; cursor: pointer; display: flex;
      align-items: center; justify-content: center; padding: 0; }
    .cm-photo-del:hover { background: rgba(0,0,0,.8); }
  `],
})
export class ReportFormComponent implements AfterViewInit, OnDestroy {
  private device = inject(DeviceIdService);
  private images = inject(ImageUploadService);
  private storage = inject(StorageService);
  private sync = inject(SyncEngineService);
  protected readonly i18n = inject(I18nService);

  readonly submitted = output<string>();
  readonly cancel = output<void>();
  readonly duplicate = output<string>();

  readonly submitting = signal(false);
  readonly error = signal('');
  readonly files = signal<Blob[]>([]);
  readonly previews = signal<string[]>([]);
  readonly maxImages = MAX_IMAGE_COUNT;
  readonly maxDesc = MAX_DESCRIPTION_LENGTH;
  readonly types = INCIDENT_TYPES;
  readonly severities = SEVERITIES;

  readonly location = signal<{ lat: number; lng: number }>({ lat: 10.483, lng: -66.833 });

  @ViewChild('mapEl') mapEl!: ElementRef<HTMLDivElement>;
  private leafletMap?: L.Map;
  private marker?: L.Marker;

  type: IncidentType = 'people_trapped';
  severity: Severity = 'medium';
  description = '';
  customType = '';
  typeOpen = signal(false);
  selectedLabel = computed(() =>
    this.i18n.t('type.' + this.type) || this.types.find(t => t.type === this.type)?.label || this.type
  );

  ngAfterViewInit(): void {
    void this.initMap();
  }

  private async initMap(): Promise<void> {
    const pos = await this.getPosition();
    if (pos.lat === 0 && pos.lng === 0) {
      pos.lat = 10.483;
      pos.lng = -66.833;
    }
    this.location.set(pos);

    const map = L.map(this.mapEl.nativeElement, {
      center: [pos.lat, pos.lng],
      zoom: 16,
      zoomControl: true,
    });
    new FallbackTileLayer(environment.tileUrl, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([pos.lat, pos.lng], { draggable: true }).addTo(map);
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      this.location.set({ lat: p.lat, lng: p.lng });
    });

    this.leafletMap = map;
    this.marker = marker;
    setTimeout(() => map.invalidateSize(), 200);
  }

  selectType(t: IncidentType): void {
    this.type = t;
    this.typeOpen.set(false);
  }

  onFiles(e: Event): void {
    const input = e.target as HTMLInputElement;
    const chosen = Array.from(input.files ?? []).slice(0, MAX_IMAGE_COUNT);
    if (!chosen.length) return;
    const prev = this.files();
    const merged = [...prev, ...chosen].slice(0, MAX_IMAGE_COUNT);
    this.files.set(merged);
    this.rebuildPreviews();
    input.value = '';
  }

  removeFile(index: number): void {
    const revoke = this.previews()[index];
    if (revoke) URL.revokeObjectURL(revoke);
    const remaining = this.files().filter((_, i) => i !== index);
    this.files.set(remaining);
    this.rebuildPreviews();
  }

  private rebuildPreviews(): void {
    this.previews().forEach(u => URL.revokeObjectURL(u));
    this.previews.set(this.files().map(f => URL.createObjectURL(f)));
  }

  ngOnDestroy(): void {
    this.previews().forEach(u => URL.revokeObjectURL(u));
    this.leafletMap?.remove();
  }

  async submit(): Promise<void> {
    this.submitting.set(true);
    this.error.set('');
    const gps = this.location();
    const outboxId = crypto.randomUUID();
    let description = this.description.slice(0, MAX_DESCRIPTION_LENGTH) || undefined;
    if (this.type === 'other' && this.customType.trim()) {
      const tag = this.customType.trim().slice(0, 60);
      description = description ? `[${tag}] ${description}` : tag;
    }
    const imageCount = this.files().length;
    const nowSec = NOW_SEC();
    const category: IncidentCategory = categoryForType(this.type);

    const payload = {
      outboxId,
      type: this.type,
      severity: this.severity,
      category,
      location: gps,
      description,
      imageCount,
      createdAt: nowSec,
      updatedAt: nowSec,
      expiresAt: nowSec + 60 * 60 * 24 * 7,
      creatorDeviceId: this.device.device().deviceId,
      creatorAlias: this.device.device().alias,
    };

    const localIncident: Incident & { __pending?: boolean; __outboxId?: string } = {
      incidentId: outboxId,
      type: this.type,
      category,
      severity: this.severity,
      status: 'active',
      location: gps,
      geohash: '',
      description,
      createdAt: nowSec,
      updatedAt: nowSec,
      expiresAt: nowSec + 60 * 60 * 24 * 7,
      creatorAlias: this.device.device().alias,
      creatorDeviceId: this.device.device().deviceId,
      confirmations: 1,
      negativeVotes: 0,
      confidence: 1,
      imageCount,
      __pending: true,
      __outboxId: outboxId,
    };

    try {
      await this.storage.putIncident(localIncident as Incident);

      if (imageCount > 0) {
        try {
          await this.images.enqueue(outboxId, this.files());
        } catch (e) {
          console.warn('Image enqueue failed; report will sync without photos', e);
        }
      }

      await this.storage.addOutbox({
        id: outboxId,
        op: 'create_incident',
        payload,
        createdAt: Date.now(),
      });

      this.sync.scheduleSync();
      this.submitted.emit('pending');
    } catch (e) {
      console.error('Failed to save report locally', e);
      this.error.set(this.i18n.t('report.error.generic'));
    } finally {
      this.submitting.set(false);
    }
  }

  private getPosition(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({ lat: 10.483, lng: -66.833 });
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve({ lat: 10.483, lng: -66.833 }),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }
}
