import { divIcon } from 'leaflet';
import type { Incident } from '../shared/constants';
import { CATEGORY_COLOURS, categoryForType } from '../shared/constants';

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

export function incidentPopupNode(incident: Incident, t: (key: string) => string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'cm-popup';

  const type = document.createElement('strong');
  type.textContent = t('type.' + incident.type) || incident.type.replace(/_/g, ' ');
  wrap.appendChild(type);

  const sev = document.createElement('span');
  sev.className = `cm-pop-sev cm-sev-${incident.severity}`;
  sev.textContent = incident.severity.toUpperCase();
  wrap.appendChild(sev);

  if (incident.description) {
    const desc = document.createElement('p');
    desc.className = 'cm-pop-desc';
    desc.textContent = incident.description;
    wrap.appendChild(desc);
  }

  const conf = document.createElement('p');
  conf.className = 'cm-pop-conf';
  conf.textContent = t('incident.confirmedBy').replace('{n}', String(incident.confirmations ?? 0));
  wrap.appendChild(conf);

  return wrap;
}