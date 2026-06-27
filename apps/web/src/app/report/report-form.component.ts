import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiClientService } from '../core/api-client.service';
import { DeviceIdService } from '../core/device-id.service';
import { ImageUploadService } from './image-upload.service';
import { StorageService } from '../core/storage.service';
import { SyncEngineService } from '../core/sync-engine.service';
import { I18nService } from '../core/i18n.service';
import { INCIDENT_TYPES, SEVERITIES } from '../shared/constants';
import type { Severity, IncidentType } from '../shared/constants';
import { MAX_DESCRIPTION_LENGTH, MAX_IMAGE_COUNT } from '../shared/constants';

@Component({
  selector: 'app-report-form',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="cm-sheet">
      <h2>{{ i18n.t('report.title') }}</h2>
      <label>{{ i18n.t('report.type') }}
        <select [(ngModel)]="type">
          @for (t of types; track t.type) { <option [value]="t.type">{{ i18n.t('type.' + t.type) || t.label }}</option> }
        </select>
      </label>
      <label>{{ i18n.t('report.severity') }}
        <select [(ngModel)]="severity">
          @for (s of severities; track s) { <option [value]="s">{{ i18n.t('report.severity.' + s) }}</option> }
        </select>
      </label>
      <label>{{ i18n.t('report.description') }}
        <textarea [(ngModel)]="description" [maxlength]="maxDesc" rows="2"></textarea>
      </label>
      <label>{{ i18n.t('report.photos', { max: maxImages }) }}
        <input type="file" accept="image/*" multiple (change)="onFiles($event)" />
      </label>
      @if (files().length) {
        <p>{{ i18n.t('report.photos.ready', { n: files().length }) }}</p>
      }
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
    select, textarea, input { padding: 12px; font-size: 18px; border: 2px solid #ccc; border-radius: 8px; }
    .cm-actions { display: flex; gap: 12px; margin-top: auto; }
    .cm-btn { flex: 1; padding: 16px; font-size: 18px; border: none; border-radius: 8px;
      background: #d32f2f; color: #fff; cursor: pointer; }
    .cm-btn-ghost { background: #eee; color: #333; }
    .cm-btn:disabled { opacity: .5; }
    .cm-err { color: #d32f2f; }
  `],
})
export class ReportFormComponent {
  private api = inject(ApiClientService);
  private images = inject(ImageUploadService);
  private storage = inject(StorageService);
  private sync = inject(SyncEngineService);
  protected device = inject(DeviceIdService);
  readonly i18n = inject(I18nService);

  readonly submitted = output<string>();
  readonly cancel = output<void>();
  readonly duplicate = output<string>();

  readonly submitting = signal(false);
  readonly error = signal('');
  readonly files = signal<Blob[]>([]);
  readonly maxImages = MAX_IMAGE_COUNT;
  readonly maxDesc = MAX_DESCRIPTION_LENGTH;
  readonly types = INCIDENT_TYPES;
  readonly severities = SEVERITIES;

  type: IncidentType = 'other';
  severity: Severity = 'medium';
  description = '';

  onFiles(e: Event): void {
    const input = e.target as HTMLInputElement;
    const chosen = Array.from(input.files ?? []).slice(0, MAX_IMAGE_COUNT);
    this.files.set(chosen);
  }

  async submit(): Promise<void> {
    this.submitting.set(true);
    this.error.set('');
    const gps = await this.getPosition();
    const payload = {
      type: this.type,
      severity: this.severity,
      location: gps,
      description: this.description.slice(0, MAX_DESCRIPTION_LENGTH) || undefined,
      imageCount: this.files().length,
    };

    try {
      if (navigator.onLine) {
        const result = await this.api.createIncident(payload);
        if (result.duplicateOf) {
          this.duplicate.emit(result.duplicateOf);
          return;
        }
        if (result.incidentId && this.files().length) {
          try { await this.images.upload(result.incidentId, this.files()); }
          catch { this.error.set(this.i18n.t('report.error.upload')); }
        }
        this.submitted.emit(result.incidentId ?? '');
      } else {
        await this.storage.addOutbox({
          id: crypto.randomUUID(),
          op: 'create_incident',
          payload,
          createdAt: Date.now(),
        });
        this.sync.scheduleSync();
        this.submitted.emit('pending');
      }
    } catch {
      this.error.set(this.i18n.t('report.error.generic'));
    } finally {
      this.submitting.set(false);
    }
  }

  private getPosition(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({ lat: 0, lng: 0 });
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve({ lat: 0, lng: 0 }),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }
}