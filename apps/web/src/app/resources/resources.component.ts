import { Component, output } from '@angular/core';

interface ExternalLink {
  title: string;
  description: string;
  url: string;
  badge?: string;
}

const LINKS: ExternalLink[] = [
  {
    title: 'SISMO 2026 VZLA — Drive de hospitales',
    description: 'Carpetas por hospital, listas de ingresados y reportes de campo (gestionado por terceros).',
    url: 'https://drive.google.com/drive/folders/1o36ifaRz45kAs5rKzci49aD0mP5JB_YI',
    badge: 'Drive público',
  },
  {
    title: 'Cruz Roja Venezolana',
    description: 'Filiales en todo el país. Búsqueda de personas y atención de emergencias.',
    url: 'https://www.cruzrojavenezolana.org/',
  },
  {
    title: 'Cruz Roja Venezolana — Búsqueda de personas (RCF)',
    description: 'Programa Restablecimiento del Contacto entre Familias. Contacta la filial más cercana.',
    url: 'https://www.cruzrojavenezolana.org/restablecimiento-del-contacto-entre-familias/',
  },
  {
    title: 'Bomberos del Distrito Capital',
    description: 'Cuerpo de bomberos de Caracas. Emergencias por derrumbe, rescate, incendio.',
    url: 'https://www.bomberosdc.gob.ve/',
  },
  {
    title: 'INAMEH — Instituto Nacional de Meteorología e Hidrología',
    description: 'Pronóstico oficial del clima y alerta de réplicas / lluvia (riesgo de deslaves).',
    url: 'https://www.inameh.gob.ve/',
  },
  {
    title: 'USGS — Detalle del evento sísmico',
    description: 'Información técnica oficial del terremoto M 7.5 del 24/06/2026 (USGS Earthquake Hazards Program).',
    url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us6000t7zp/executive',
  },
];

@Component({
  selector: 'app-resources',
  standalone: true,
  template: `
    <div class="cm-backdrop" (click)="close.emit()"></div>
    <div class="cm-resources" role="dialog" aria-label="Recursos externos">
      <header>
        <h3>Recursos externos</h3>
        <button class="cm-close" (click)="close.emit()" aria-label="Cerrar">×</button>
      </header>

      <p class="cm-disclaimer">
        Estos enlaces son recursos de <strong>terceros</strong>. CrisisMap solo los comparte
        como referencia; <strong>no garantiza ni verifica</strong> la exactitud, disponibilidad
        ni vigencia de su contenido. Úselos bajo su propio criterio.
      </p>

      <ul class="cm-linklist">
        @for (link of links; track link.url) {
          <li>
            <a [href]="link.url" target="_blank" rel="noopener noreferrer">
              <span class="cm-link-title">{{ link.title }}</span>
              @if (link.badge) { <span class="cm-badge">{{ link.badge }}</span> }
              <span class="cm-link-desc">{{ link.description }}</span>
              <span class="cm-link-url">{{ link.url }}</span>
            </a>
          </li>
        }
      </ul>

      <p class="cm-disclaimer cm-disclaimer-footer">
        ¿Tienes un recurso oficial para agregar? Comparte el enlace por los canales
        habituales. CrisisMap no edita esta lista automáticamente.
      </p>

      <button class="cm-btn" (click)="close.emit()">Cerrar</button>
    </div>
  `,
  styles: [`
    .cm-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 1100; }
    .cm-resources {
      position: fixed; top: 5vh; left: 50%; transform: translateX(-50%);
      width: min(92vw, 480px); max-height: 90vh;
      background: #fff; border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,.4);
      display: flex; flex-direction: column;
      z-index: 1101; overflow: hidden;
    }
    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px; border-bottom: 1px solid #eee;
      background: #1976d2; color: #fff;
    }
    header h3 { margin: 0; font-size: 18px; }
    .cm-close {
      background: transparent; color: #fff; border: none;
      font-size: 24px; line-height: 1; cursor: pointer; padding: 0 8px;
    }
    .cm-disclaimer {
      padding: 14px 20px; margin: 0;
      background: #fff8e1; color: #5d4037;
      font-size: 13px; line-height: 1.4;
      border-bottom: 1px solid #f0e0a0;
    }
    .cm-disclaimer strong { font-weight: 700; }
    .cm-disclaimer-footer {
      background: #f5f5f5; color: #555;
      font-size: 12px; border-top: 1px solid #eee; border-bottom: none;
    }
    .cm-linklist {
      list-style: none; margin: 0; padding: 8px 0;
      overflow-y: auto; flex: 1;
    }
    .cm-linklist li { margin: 0; padding: 0; border-bottom: 1px solid #f0f0f0; }
    .cm-linklist li:last-child { border-bottom: none; }
    .cm-linklist a {
      display: block; padding: 14px 20px;
      text-decoration: none; color: #111;
    }
    .cm-linklist a:hover, .cm-linklist a:focus { background: #f5f9ff; outline: none; }
    .cm-link-title {
      display: block; font-weight: 700; font-size: 15px; color: #1976d2; margin-bottom: 4px;
    }
    .cm-badge {
      display: inline-block; padding: 2px 8px; margin-left: 6px;
      background: #fff3e0; color: #e65100;
      border-radius: 10px; font-size: 11px; font-weight: 600;
      vertical-align: middle;
    }
    .cm-link-desc {
      display: block; font-size: 13px; color: #555; line-height: 1.4; margin-bottom: 4px;
    }
    .cm-link-url {
      display: block; font-size: 11px; color: #999;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .cm-btn {
      margin: 16px 20px; padding: 14px; font-size: 16px;
      background: #1976d2; color: #fff; border: none; border-radius: 8px;
      cursor: pointer; font-weight: 600;
    }
  `],
})
export class ResourcesComponent {
  readonly close = output<void>();
  readonly links = LINKS;
}