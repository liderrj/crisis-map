import { Component, input, output, inject, signal, effect } from '@angular/core';
import { ApiClientService, Confirmer } from '../core/api-client.service';
import { StorageService } from '../core/storage.service';
import { SyncEngineService } from '../core/sync-engine.service';
import { I18nService } from '../core/i18n.service';
import { environment } from '../../environments/environment';
import type { ConfirmationAction, Incident } from '../shared/constants';

type IncidentInput = Incident & { __pending?: boolean };

@Component({
  selector: 'app-incident-detail',
  standalone: true,
  template: `
    <div class="cm-modal" (click)="onBackdrop($event)">
      <div class="cm-modal-box" (click)="$event.stopPropagation()">
        <header class="cm-modal-header">
          <h3 class="cm-type">{{ i18n.t('type.' + (incident()?.type ?? '')) || (incident()?.type || '').replace(/_/g, ' ') }}</h3>
          <button class="cm-x" (click)="close.emit()" aria-label="close">×</button>
        </header>

        @if (isPending()) {
          <p class="cm-pending-banner">{{ i18n.t('report.pending') }}</p>
        }

        <div class="cm-badges">
          @if (incident()?.severity) {
            <span class="cm-badge cm-sev-{{ incident()?.severity }}">
              {{ i18n.t('report.severity.' + incident()?.severity) || incident()?.severity }}
            </span>
          }
          @if (incident()?.status === 'resolved') {
            <span class="cm-badge cm-status-resolved">{{ i18n.t('incident.status.resolved') }}</span>
          } @else {
            <span class="cm-badge cm-status-active">{{ i18n.t('incident.status.active') }}</span>
          }
          @if (incident()?.category) {
            <span class="cm-badge cm-cat">{{ i18n.t('cat.' + incident()?.category) || incident()?.category }}</span>
          }
        </div>

        @if (images().length) {
          <div class="cm-gallery">
            @for (key of images(); track key) {
              <img class="cm-photo" [src]="imageUrl(key)" alt="" loading="lazy"
                   (click)="openLightbox(imageUrl(key))" />
            }
          </div>
        } @else if (loadingImages()) {
          <p class="cm-loading">{{ i18n.t('incident.loading') }}</p>
        } @else if ((incident()?.imageCount ?? 0) > 0) {
          <p class="cm-loading">{{ i18n.t('incident.noImages') }}</p>
        }

        @if (incident()?.description) {
          <p class="cm-desc">{{ incident()?.description }}</p>
        }

        <div class="cm-meta">
          @if ((incident()?.confirmations ?? 0) > 0) {
            <span class="cm-meta-row">
              <strong>{{ i18n.t('incident.confirmedBy', { n: incident()?.confirmations ?? 0 }) }}</strong>
            </span>
          }
          @if (incident()?.creatorAlias) {
            <span class="cm-meta-row">{{ i18n.t('incident.reportedBy') }} <em>{{ incident()?.creatorAlias }}</em></span>
          }
          @if (incident()?.createdAt) {
            <span class="cm-meta-row cm-meta-time">{{ formatTime(incident()?.createdAt) }}</span>
          }
          @if (incident()?.expiresAt) {
            <span class="cm-meta-row cm-meta-expires">
              {{ i18n.t('incident.expiresIn', { time: formatRemaining(incident()?.expiresAt!) }) }}
            </span>
          }
          @if (incident()?.location) {
            <span class="cm-meta-row cm-meta-coords">
              {{ fmtCoord(incident()!.location.lat) }}, {{ fmtCoord(incident()!.location.lng) }}
            </span>
          }
        </div>

        @if (incident()?.location && !isPending()) {
          <div class="cm-maps">
            <a class="cm-map-btn cm-gmaps" [href]="gmapsUrl()" target="_blank" rel="noopener">{{ i18n.t('incident.openGmaps') }}</a>
            <a class="cm-map-btn cm-waze" [href]="wazeUrl()" target="_blank" rel="noopener">{{ i18n.t('incident.openWaze') }}</a>
          </div>
        }

        <div class="cm-confirmers">
          <h4 class="cm-confirmers-title">{{ i18n.t('incident.confirmers') }}</h4>
          @if (loadingConfirmers()) {
            <p class="cm-loading">{{ i18n.t('incident.loading') }}</p>
          } @else if (confirmers().length === 0) {
            <p class="cm-confirmers-empty">{{ i18n.t('incident.confirmers.empty') }}</p>
          } @else {
            <ul class="cm-confirmer-list">
              @for (c of (showAllConfirmers() ? confirmers() : confirmers().slice(0, 5)); track c.deviceId) {
                <li class="cm-confirmer-item">
                  <span class="cm-confirmer-alias">{{ c.alias || '—' }}</span>
                  <span class="cm-confirmer-action">{{ i18n.t('incident.action.' + c.action) }}</span>
                  <span class="cm-confirmer-time">{{ formatTime(c.createdAt) }}</span>
                </li>
              }
            </ul>
            @if (confirmers().length > 5 && !showAllConfirmers()) {
              <button class="cm-confirmers-more" (click)="showAllConfirmers.set(true)">
                {{ i18n.t('incident.confirmers.showMore') }} ({{ confirmers().length - 5 }})</button>
            }
          }
        </div>

        <h4>{{ i18n.t('incident.title') }}</h4>
        <div class="cm-verify">
          <button (click)="act('confirm')" [disabled]="isPending()">{{ i18n.t('incident.confirm') }}</button>
          <button (click)="act('improved')" [disabled]="isPending()">{{ i18n.t('incident.improved') }}</button>
          <button (click)="act('worsened')" [disabled]="isPending()">{{ i18n.t('incident.worsened') }}</button>
          <button (click)="act('no_longer_exists')" [disabled]="isPending()">{{ i18n.t('incident.gone') }}</button>
        </div>

        @if (msg()) { <p class="cm-msg">{{ msg() }}</p> }

        <button class="cm-close" (click)="close.emit()">{{ i18n.t('incident.close') }}</button>
      </div>
    </div>

    @if (lightbox()) {
      <div class="cm-lightbox" (click)="lightbox.set('')">
        <img [src]="lightbox()" alt="" />
        <button class="cm-lightbox-close" (click)="lightbox.set('')">×</button>
      </div>
    }
  `,
  styles: [`
    .cm-modal { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 1300;
      display: flex; align-items: center; justify-content: center; }
    .cm-modal-box { background: #fff; border-radius: 12px; max-width: 480px; width: 95%;
      max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,.2); }
    .cm-modal-header { display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px; border-bottom: 1px solid #eee; position: sticky; top: 0;
      background: #fff; z-index: 1; }
    .cm-type { margin: 0; font-size: 18px; font-weight: 700; }
    .cm-x { background: transparent; border: none; font-size: 26px; line-height: 1;
      cursor: pointer; color: #888; padding: 0 4px; }
    .cm-x:hover { color: #333; }
    .cm-pending-banner { margin: 0; padding: 10px 18px; background: #fff8e1;
      color: #5d4037; font-size: 13px; font-weight: 600; border-bottom: 1px solid #f0e0a0; }
    .cm-badges { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 18px 0; }
    .cm-badge { display: inline-block; padding: 3px 8px; border-radius: 10px;
      font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .3px; }
    .cm-sev-low { background: #fff3e0; color: #e65100; }
    .cm-sev-medium { background: #fffde7; color: #f57f17; }
    .cm-sev-high { background: #ffebee; color: #c62828; }
    .cm-status-active { background: #e3f2fd; color: #1565c0; }
    .cm-status-resolved { background: #e8f5e9; color: #2e7d32; }
    .cm-cat { background: #f5f5f5; color: #555; }
    .cm-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
      gap: 6px; padding: 12px 18px; }
    .cm-photo { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 6px;
      cursor: zoom-in; background: #f5f5f5; }
    .cm-photo:hover { opacity: .92; }
    .cm-loading { padding: 8px 18px; color: #888; font-size: 13px; margin: 0; }
    .cm-desc { padding: 0 18px; margin: 8px 0 12px; line-height: 1.5; }
    .cm-meta { padding: 0 18px; display: flex; flex-direction: column; gap: 4px;
      color: #555; font-size: 13px; }
    .cm-meta-row strong { color: #2e7d32; }
    .cm-meta-time { color: #888; }
    .cm-meta-expires { color: #d32f2f; font-size: 12px; }
    .cm-meta-coords { color: #777; font-size: 12px; font-family: monospace; }
    .cm-maps { display: flex; gap: 8px; padding: 10px 18px 0; }
    .cm-map-btn { flex: 1; text-align: center; padding: 10px; border-radius: 8px;
      font-size: 14px; font-weight: 600; text-decoration: none; color: #fff; }
    .cm-gmaps { background: #4285f4; }
    .cm-gmaps:hover { background: #3367d6; }
    .cm-waze { background: #33ccff; }
    .cm-waze:hover { background: #00b8e6; }
    .cm-confirmers { padding: 0 18px; }
    .cm-confirmers-title { margin: 16px 0 8px; font-size: 15px; }
    .cm-confirmers-empty { color: #888; font-size: 13px; margin: 4px 0; }
    .cm-confirmer-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .cm-confirmer-item { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 4px 0; border-bottom: 1px solid #f0f0f0; }
    .cm-confirmer-item:last-child { border-bottom: none; }
    .cm-confirmer-alias { font-weight: 700; color: #333; min-width: 80px; }
    .cm-confirmer-action { color: #666; text-transform: lowercase; }
    .cm-confirmer-time { color: #999; font-size: 11px; margin-left: auto; white-space: nowrap; }
    .cm-confirmers-more { background: transparent; border: 1px solid #ccc; border-radius: 6px; padding: 6px 12px; font-size: 12px; color: #555; cursor: pointer; margin-top: 4px; }
    .cm-confirmers-more:hover { background: #f5f5f5; }
    h4 { margin: 16px 18px 8px; font-size: 15px; }
    .cm-verify { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 0 18px; }
    .cm-verify button { padding: 14px; font-size: 15px; border: none; border-radius: 8px;
      background: #1976d2; color: #fff; cursor: pointer; font-weight: 600; }
    .cm-verify button:hover:not(:disabled) { background: #1565c0; }
    .cm-verify button:disabled { background: #bdbdbd; cursor: not-allowed; }
    .cm-msg {
      color: #1b5e20;
      font-weight: 600;
      margin: 12px 18px 0;
      padding: 10px 12px;
      background: #e8f5e9;
      border-left: 4px solid #2e7d32;
      border-radius: 4px;
      font-size: 14px;
    }
    .cm-close { margin: 16px 18px; padding: 12px; border: none; border-radius: 8px;
      background: #eee; cursor: pointer; font-size: 16px; width: calc(100% - 36px); }
    .cm-lightbox { position: fixed; inset: 0; background: rgba(0,0,0,.92); z-index: 1400;
      display: flex; align-items: center; justify-content: center; cursor: zoom-out; }
    .cm-lightbox img { max-width: 95vw; max-height: 95vh; object-fit: contain; }
    .cm-lightbox-close { position: absolute; top: 16px; right: 16px; background: rgba(255,255,255,.15);
      border: none; color: #fff; font-size: 32px; line-height: 1; cursor: pointer;
      padding: 4px 12px; border-radius: 6px; }
  `],
})
export class IncidentDetailComponent {
  readonly incident = input<IncidentInput | null>(null);
  readonly close = output<void>();
  private api = inject(ApiClientService);
  private storage = inject(StorageService);
  private sync = inject(SyncEngineService);
  readonly i18n = inject(I18nService);

  readonly images = signal<string[]>([]);
  readonly loadingImages = signal(false);
  readonly confirmers = signal<Confirmer[]>([]);
  readonly loadingConfirmers = signal(false);
  readonly showAllConfirmers = signal(false);
  readonly lightbox = signal('');
  readonly msg = signal('');
  private msgTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const id = this.incident()?.incidentId;
      if (id) {
        this.loadImages(id);
        this.loadConfirmers(id);
      } else {
        this.images.set([]);
        this.confirmers.set([]);
        this.showAllConfirmers.set(false);
        this.lightbox.set('');
      }
    });
  }

  isPending(): boolean {
    return !!this.incident()?.__pending;
  }

  private async loadImages(incidentId: string): Promise<void> {
    this.loadingImages.set(true);
    try {
      const keys = await this.api.listImages(incidentId);
      if (this.incident()?.incidentId === incidentId) {
        this.images.set(keys);
      }
    } catch {
      this.images.set([]);
    } finally {
      this.loadingImages.set(false);
    }
  }

  private async loadConfirmers(incidentId: string): Promise<void> {
    this.loadingConfirmers.set(true);
    try {
      const list = await this.api.listConfirmations(incidentId);
      if (this.incident()?.incidentId === incidentId) {
        this.confirmers.set(list);
      }
    } catch {
      // silently ignore — the section will just show the empty-state
    } finally {
      this.loadingConfirmers.set(false);
    }
  }

  imageUrl(key: string): string {
    return `${environment.imageCdnUrl}/${key}`;
  }

  openLightbox(url: string): void {
    this.lightbox.set(url);
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.close.emit();
  }

  formatTime(epochSec: number | undefined): string {
    if (!epochSec) return '';
    return new Date(epochSec * 1000).toLocaleString();
  }

  formatRemaining(epochSec: number): string {
    const diff = epochSec * 1000 - Date.now();
    if (diff <= 0) return '0';
    const days = Math.floor(diff / 86400000);
    if (days > 0) return `${days}d`;
    const hours = Math.floor(diff / 3600000);
    if (hours > 0) return `${hours}h`;
    return `${Math.floor(diff / 60000)}m`;
  }

  async act(action: ConfirmationAction): Promise<void> {
    const id = this.incident()?.incidentId;
    if (!id || this.isPending()) return;

    // Confirmations inherit the demo flag from the parent incident.
    const isDemo = this.incident()?.isDemo === true;

    // Optimistic feedback first so the user always sees something happen.
    this.msg.set(this.actionMessage(action));
    if (this.msgTimer) clearTimeout(this.msgTimer);
    this.msgTimer = setTimeout(() => this.msg.set(''), 12000);

    try {
      await this.storage.addOutbox({
        id: crypto.randomUUID(),
        op: 'confirm',
        payload: { incidentId: id, action, isDemo: isDemo ? true : undefined },
        createdAt: Date.now(),
      });

      const inc = await this.storage.getIncident(id);
      if (inc) {
        const delta = action === 'confirm' ? 1 : action === 'improved' ? 1 : action === 'worsened' ? 1 : 0;
        const next: Incident = {
          ...inc,
          confirmations: (inc.confirmations ?? 0) + delta,
          updatedAt: Math.floor(Date.now() / 1000),
          status: action === 'no_longer_exists' ? 'resolved' : inc.status,
        };
        await this.storage.putIncident(next);
      }
      this.sync.scheduleSync();
    } catch (err) {
      this.msg.set(this.i18n.t('incident.alreadyVerified'));
    }
  }

  fmtCoord(v: number): string {
    return v.toFixed(5);
  }

  gmapsUrl(): string {
    const loc = this.incident()?.location;
    return loc ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}` : '';
  }

  wazeUrl(): string {
    const loc = this.incident()?.location;
    return loc ? `https://waze.com/ul?ll=${loc.lat},${loc.lng}&navigate=yes` : '';
  }

  private actionMessage(action: ConfirmationAction): string {
    switch (action) {
      case 'confirm':           return this.i18n.t('incident.msg.confirm');
      case 'improved':          return this.i18n.t('incident.msg.improved');
      case 'worsened':          return this.i18n.t('incident.msg.worsened');
      case 'no_longer_exists':  return this.i18n.t('incident.msg.gone');
    }
  }
}
