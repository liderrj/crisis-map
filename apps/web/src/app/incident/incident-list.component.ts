import { Component, inject, signal, output } from '@angular/core';
import { StorageService } from '../core/storage.service';
import { IncidentLayerService } from '../map/incident-layer.service';
import { I18nService } from '../core/i18n.service';
import type { Incident } from '../shared/constants';

const PAGE_SIZE = 20;
const RANGES = [1, 5, 10, 25, 50, 0] as const;
type RangeKm = (typeof RANGES)[number];

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const aa =
    sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

@Component({
  selector: 'app-incident-list',
  standalone: true,
  template: `
    <div class="cm-list-sheet">
      <header class="cm-list-header">
        <h2>{{ i18n.t('list.title') }}</h2>
        <button class="cm-x" (click)="close.emit()" aria-label="close">×</button>
      </header>

      <div class="cm-list-range">
        @for (r of ranges; track r) {
          <button class="cm-range-btn" [class.active]="range() === r"
            (click)="setRange(r)">
            {{ r === 0 ? i18n.t('list.all') : r + ' km' }}
          </button>
        }
      </div>

      @if (locating()) {
        <p class="cm-list-status">{{ i18n.t('list.locating') }}</p>
      } @else if (!sorted.length) {
        <p class="cm-list-status">{{ i18n.t('list.empty') }}</p>
      } @else {
        <div class="cm-list-items">
          @for (item of visible; track item.incidentId) {
            <button class="cm-list-item" (click)="select(item)">
              <span class="cm-list-sev cm-sev-{{ item.severity }}"></span>
              <div class="cm-list-body">
                <div class="cm-list-top">
                  <strong>{{ i18n.t('type.' + item.type) || item.type }}</strong>
                  <span class="cm-list-dist">{{ item._dist < 1 ? (item._dist * 1000).toFixed(0) + ' m' : item._dist.toFixed(1) + ' km' }}</span>
                </div>
                <div class="cm-list-mid">
                  @if (item.description) {
                    <span class="cm-list-desc">{{ item.description }}</span>
                  }
                  <span class="cm-list-badge" [class.cm-badge-pending]="item.__pending">
                    {{ item.__pending ? i18n.t('report.pending') : (item.status === 'resolved' ? i18n.t('incident.status.resolved') : i18n.t('incident.status.active')) }}
                  </span>
                </div>
                <div class="cm-list-meta">
                  @if (item.imageCount > 0) { <span class="cm-list-img">📷</span> }
                  <span>{{ i18n.t('incident.confirmedBy', { n: item.confirmations }) }}</span>
                  <span>{{ formatTime(item.createdAt) }}</span>
                </div>
              </div>
            </button>
          } @empty { }
          <div #sentinel class="cm-sentinel"></div>
        </div>
      }

      @if (sorted.length) {
        <div class="cm-list-export-bar">
          <button class="cm-list-export" (click)="exportText()">{{ i18n.t('list.exportText') }}</button>
          <button class="cm-list-export" (click)="exportCsv()">{{ i18n.t('list.exportCsv') }}</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .cm-list-sheet { position: fixed; inset: 0; background: #fff; z-index: 1200;
      display: flex; flex-direction: column; overflow: hidden; }
    .cm-list-header { display: flex; align-items: center; justify-content: space-between;
      padding: 14px 18px; border-bottom: 1px solid #eee; flex: 0 0 auto; }
    .cm-list-header h2 { margin: 0; font-size: 18px; font-weight: 700; }
    .cm-x { background: transparent; border: none; font-size: 26px; line-height: 1;
      cursor: pointer; color: #888; padding: 0 4px; }
    .cm-x:hover { color: #333; }
    .cm-list-range { display: flex; gap: 6px; padding: 10px 18px; overflow-x: auto;
      flex: 0 0 auto; }
    .cm-range-btn { padding: 6px 14px; border-radius: 14px; border: 1px solid #ccc;
      background: #fff; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .cm-range-btn.active { background: #1976d2; color: #fff; border-color: #1976d2; }
    .cm-list-status { padding: 40px 18px; text-align: center; color: #888;
      font-size: 15px; flex: 1; }
    .cm-list-items { flex: 1; overflow-y: auto; padding: 0 18px; }
    .cm-list-item { display: flex; gap: 12px; width: 100%; padding: 12px 0;
      border: none; border-bottom: 1px solid #eee; background: transparent;
      cursor: pointer; text-align: left; font-family: inherit; }
    .cm-list-item:hover { background: #fafafa; }
    .cm-list-item:last-child { border-bottom: none; }
    .cm-list-sev { width: 8px; border-radius: 4px; flex: 0 0 auto; margin-top: 4px;
      height: 32px; }
    .cm-sev-low { background: #f9a825; }
    .cm-sev-medium { background: #f57f17; }
    .cm-sev-high { background: #c62828; }
    .cm-list-body { flex: 1; min-width: 0; }
    .cm-list-top { display: flex; justify-content: space-between; align-items: baseline;
      gap: 8px; }
    .cm-list-top strong { font-size: 15px; }
    .cm-list-dist { font-size: 12px; color: #888; white-space: nowrap; }
    .cm-list-mid { display: flex; gap: 6px; align-items: flex-start; margin-top: 2px; }
    .cm-list-desc { font-size: 13px; color: #555; overflow: hidden;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      line-clamp: 2; flex: 1; }
    .cm-list-badge { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 8px;
      background: #e3f2fd; color: #1565c0; text-transform: uppercase; letter-spacing: .3px;
      white-space: nowrap; flex: 0 0 auto; }
    .cm-badge-pending { background: #fff8e1; color: #f57f17; }
    .cm-list-meta { display: flex; gap: 10px; margin-top: 4px; font-size: 12px; color: #999; }
    .cm-list-img { font-size: 14px; }
    .cm-sentinel { height: 1px; }
    .cm-list-export-bar { display: flex; gap: 8px; margin: 12px 18px; flex: 0 0 auto; }
    .cm-list-export { flex: 1; padding: 14px; border: 2px dashed #1976d2;
      border-radius: 8px; background: transparent; color: #1976d2;
      font-size: 14px; font-weight: 700; cursor: pointer; text-align: center; }
    .cm-list-export:hover { background: #e3f2fd; }
  `],
})
export class IncidentListComponent {
  private storage = inject(StorageService);
  private layer = inject(IncidentLayerService);
  readonly i18n = inject(I18nService);

  readonly close = output<void>();
  readonly selectIncident = output<Incident & { __pending?: boolean }>();

  readonly ranges: RangeKm[] = [...RANGES];
  readonly range = signal<RangeKm>(10);
  readonly locating = signal(true);
  readonly allIncidents = signal<(Incident & { __pending?: boolean; _dist: number })[]>([]);
  readonly page = signal(1);
  private position: { lat: number; lng: number } = { lat: 10.483, lng: -66.833 };
  private observer?: IntersectionObserver;



  get sorted() {
    const r = this.range();
    const all = this.allIncidents();
    const filtered = r === 0 ? all : all.filter((i) => i._dist <= r);
    return filtered;
  }

  get visible() {
    const all = this.sorted;
    const p = this.page();
    return all.slice(0, p * PAGE_SIZE);
  }

  ngAfterViewInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.locating.set(true);
    const pos = await this.getPosition();
    this.position = pos;

    const cached = await this.storage.getCachedIncidents();
    const pending = await this.layer.getPendingIncidents();
    const pendingIds = new Set(pending.map((p) => p.incidentId));

    const all = [...pending, ...cached.filter((i) => !pendingIds.has(i.incidentId))];
    const withDist = all.map((i) => ({
      ...i,
      _dist: haversineKm(pos, { lat: i.location.lat, lng: i.location.lng }),
    }));
    withDist.sort((a, b) => a._dist - b._dist);
    this.allIncidents.set(withDist);
    this.locating.set(false);

    setTimeout(() => this.setupObserver(), 100);
  }

  private setupObserver(): void {
    if (this.observer) this.observer.disconnect();
    const el = document.querySelector('.cm-sentinel');
    if (!el) return;
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          this.page.update((p) => p + 1);
        }
      },
      { rootMargin: '200px' },
    );
    this.observer.observe(el);
  }

  setRange(r: RangeKm): void {
    this.range.set(r);
    this.page.set(1);
    setTimeout(() => {
      const el = document.querySelector('.cm-list-items');
      if (el) el.scrollTop = 0;
      this.setupObserver();
    }, 50);
  }

  select(item: Incident & { __pending?: boolean; _dist: number }): void {
    const { _dist: _, ...clean } = item;
    this.selectIncident.emit(clean as Incident & { __pending?: boolean });
  }

  formatTime(epochSec: number): string {
    return new Date(epochSec * 1000).toLocaleDateString();
  }

  async exportText(): Promise<void> {
    const items = this.sorted;
    const lines = items.map((i) => {
      const type = this.i18n.t('type.' + i.type) || i.type;
      const sev = this.i18n.t('report.severity.' + i.severity) || i.severity;
      const dist = i._dist < 1 ? (i._dist * 1000).toFixed(0) + 'm' : i._dist.toFixed(1) + 'km';
      const desc = i.description ? i.description.slice(0, 100) : '';
      const coords = `${i.location.lat.toFixed(4)},${i.location.lng.toFixed(4)}`;
      return `• ${type} [${sev}] ${dist} — ${desc} (${coords})`;
    });
    const text = `${this.i18n.t('list.title')} (${items.length})\n\n${lines.join('\n')}`;

    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch { /* fall through */ }
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      prompt(this.i18n.t('list.copyPrompt'), text);
    }
  }

  async exportCsv(): Promise<void> {
    const items = this.sorted;
    const rows = items.map((i) => {
      const type = this.escapeCsv(this.i18n.t('type.' + i.type) || i.type);
      const sev = this.i18n.t('report.severity.' + i.severity) || i.severity;
      const status = i.__pending ? 'pending' : i.status;
      const desc = this.escapeCsv(i.description ?? '');
      const alias = this.escapeCsv(i.creatorAlias ?? '');
      const created = new Date(i.createdAt * 1000).toISOString().slice(0, 16).replace('T', ' ');
      return `${type},${sev},${status},${i.location.lat.toFixed(5)},${i.location.lng.toFixed(5)},${i._dist.toFixed(2)},${desc},${alias},${created},${i.confirmations}`;
    });
    const header = 'Tipo,Severidad,Estado,Lat,Lng,Distancia_km,Descripcion,Reportado_por,Creado,Confirmaciones';
    const bom = '\uFEFF';
    const csv = bom + header + '\n' + rows.join('\n');
    this.downloadFile(csv, 'reportes.csv', 'text/csv;charset=utf-8;');
  }

  private escapeCsv(v: string): string {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
  }

  private downloadFile(content: string, name: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
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

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
