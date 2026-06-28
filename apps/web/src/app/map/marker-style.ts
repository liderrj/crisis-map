import { divIcon } from 'leaflet';
import type { Incident } from '../shared/constants';
import { CATEGORY_COLOURS, categoryForType } from '../shared/constants';
import { environment } from '../../environments/environment';

type PendingIncident = Incident & { __pending?: boolean };

export function incidentMarkerIcon(incident: Incident, typeLabel: string) {
  const colour = CATEGORY_COLOURS[incident.category ?? categoryForType(incident.type)];
  const dot = document.createElement('div');
  dot.className = 'cm-marker-dot';
  dot.style.background = colour;
  dot.title = typeLabel;
  return divIcon({
    className: 'cm-marker',
    html: dot.outerHTML,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

/**
 * Variant for incidents that the user created locally and have not yet
 * been confirmed by the server. Same dot, but with a pulsing ring
 * so the user can tell at a glance which ones are still in flight.
 */
export function pendingMarkerIcon(incident: PendingIncident, typeLabel: string) {
  const colour = CATEGORY_COLOURS[incident.category ?? categoryForType(incident.type)];
  const wrap = document.createElement('div');
  wrap.className = 'cm-marker-wrap cm-marker-pending';
  const ring = document.createElement('div');
  ring.className = 'cm-marker-ring';
  const dot = document.createElement('div');
  dot.className = 'cm-marker-dot';
  dot.style.background = colour;
  dot.title = typeLabel;
  wrap.appendChild(ring);
  wrap.appendChild(dot);
  return divIcon({
    className: 'cm-marker cm-marker-pending-icon',
    html: wrap.outerHTML,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function relativeTime(epochSec: number, t: (key: string) => string): string {
  const diff = Date.now() - epochSec * 1000;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return t('time.justNow') || 'ahora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} ${t('time.minutes') || 'min'}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ${t('time.hours') || 'h'}`;
  const day = Math.floor(hr / 24);
  return `${day} ${t('time.days') || 'd'}`;
}

function imageUrl(key: string): string {
  return `${environment.imageCdnUrl}/${key}`;
}

export function incidentPopupNode(incident: PendingIncident, t: (key: string) => string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'cm-popup';

  if (incident.__pending) {
    const banner = document.createElement('div');
    banner.className = 'cm-pop-pending';
    banner.textContent = t('report.pending') || 'Pendiente de sincronizar';
    wrap.appendChild(banner);
  }

  const header = document.createElement('div');
  header.className = 'cm-pop-header';

  const type = document.createElement('strong');
  type.className = 'cm-pop-type';
  type.textContent = t('type.' + incident.type) || incident.type.replace(/_/g, ' ');
  header.appendChild(type);

  const sev = document.createElement('span');
  sev.className = `cm-pop-sev cm-sev-${incident.severity}`;
  sev.textContent = t('report.severity.' + incident.severity) || incident.severity.toUpperCase();
  header.appendChild(sev);

  if (incident.status === 'resolved') {
    const resolved = document.createElement('span');
    resolved.className = 'cm-pop-status cm-status-resolved';
    resolved.textContent = t('incident.status.resolved') || 'Resuelto';
    header.appendChild(resolved);
  }

  wrap.appendChild(header);

  if ((incident.imageCount ?? 0) > 0) {
    const images = document.createElement('div');
    images.className = 'cm-pop-images';
    images.dataset['incidentId'] = incident.incidentId;
    if (incident.__pending) {
      images.textContent = t('incident.pendingImages') || 'Fotos pendientes de sincronización';
    } else {
      images.textContent = t('incident.loading') || 'Cargando…';
    }
    wrap.appendChild(images);
  }

  if (incident.description) {
    const desc = document.createElement('p');
    desc.className = 'cm-pop-desc';
    desc.textContent = incident.description;
    wrap.appendChild(desc);
  }

  const meta = document.createElement('div');
  meta.className = 'cm-pop-meta';

  const conf = document.createElement('span');
  conf.className = 'cm-pop-conf';
  conf.textContent = t('incident.confirmedBy').replace('{n}', String(incident.confirmations ?? 0));
  meta.appendChild(conf);

  if (incident.updatedAt) {
    const sep = document.createElement('span');
    sep.className = 'cm-pop-sep';
    sep.textContent = '·';
    meta.appendChild(sep);

    const time = document.createElement('span');
    time.className = 'cm-pop-time';
    time.textContent = relativeTime(incident.updatedAt, t);
    meta.appendChild(time);
  }

  wrap.appendChild(meta);

  if (incident.creatorAlias) {
    const by = document.createElement('p');
    by.className = 'cm-pop-by';
    by.textContent = (t('incident.reportedBy') || 'Reportado por') + ' ' + incident.creatorAlias;
    wrap.appendChild(by);
  }

  const more = document.createElement('button');
  more.className = 'cm-pop-more';
  more.type = 'button';
  more.textContent = t('incident.viewDetails') || 'Ver detalles';
  more.dataset['viewDetails'] = incident.incidentId;
  wrap.appendChild(more);

  return wrap;
}

export function renderPopupImages(container: HTMLElement, keys: string[]): void {
  container.textContent = '';
  if (!keys.length) return;
  for (const key of keys) {
    const img = document.createElement('img');
    img.className = 'cm-pop-thumb';
    img.src = imageUrl(key);
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = () => { img.style.display = 'none'; };
    container.appendChild(img);
  }
}
