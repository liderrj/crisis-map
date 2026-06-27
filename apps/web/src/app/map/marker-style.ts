import { divIcon } from 'leaflet';
import type { Incident } from '../shared/constants';
import { CATEGORY_COLOURS, categoryForType } from '../shared/constants';

export function incidentMarkerIcon(incident: Incident) {
  const colour = CATEGORY_COLOURS[incident.category ?? categoryForType(incident.type)];
  return divIcon({
    className: 'cm-marker',
    html: `<div class="cm-marker-dot" style="background:${colour}" title="${incident.type}"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

export function incidentPopupHtml(incident: Incident): string {
  const conf = `Confirmed by ${incident.confirmations} people`;
  const desc = incident.description ? `<p class="cm-pop-desc">${incident.description}</p>` : '';
  const sev = incident.severity.toUpperCase();
  return `
    <div class="cm-popup">
      <strong>${incident.type.replace(/_/g, ' ')}</strong>
      <span class="cm-pop-sev cm-sev-${incident.severity}">${sev}</span>
      ${desc}
      <p class="cm-pop-conf">${conf}</p>
      <button class="cm-pop-btn" data-confirm="${incident.incidentId}">Confirm</button>
    </div>`;
}
