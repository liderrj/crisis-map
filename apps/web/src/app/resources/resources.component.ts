import { Component, output, inject, computed } from '@angular/core';
import { I18nService } from '../core/i18n.service';

interface ExternalLink {
  titleKey: string;
  descriptionKey: string;
  titleFallback: string;
  descriptionFallback: string;
  url: string;
  badgeKey?: string;
  badgeFallback?: string;
}

const LINKS: ExternalLink[] = [
  {
    titleKey: 'resources.link.drive.title',
    descriptionKey: 'resources.link.drive.desc',
    titleFallback: 'SISMO 2026 VZLA — Drive de hospitales',
    descriptionFallback: 'Carpetas por hospital, listas de ingresados y reportes de campo (gestionado por terceros).',
    url: 'https://drive.google.com/drive/folders/1o36ifaRz45kAs5rKzci49aD0mP5JB_YI',
    badgeKey: 'resources.badge.public',
    badgeFallback: 'Drive público',
  },
  {
    titleKey: 'resources.link.crv.title',
    descriptionKey: 'resources.link.crv.desc',
    titleFallback: 'Cruz Roja Venezolana',
    descriptionFallback: 'Filiales en todo el país. Búsqueda de personas y atención de emergencias.',
    url: 'https://www.cruzrojavenezolana.org/',
  },
  {
    titleKey: 'resources.link.crv.rcf.title',
    descriptionKey: 'resources.link.crv.rcf.desc',
    titleFallback: 'Cruz Roja Venezolana — Búsqueda de personas (RCF)',
    descriptionFallback: 'Programa Restablecimiento del Contacto entre Familias. Contacta la filial más cercana.',
    url: 'https://www.cruzrojavenezolana.org/restablecimiento-del-contacto-entre-familias/',
  },
  {
    titleKey: 'resources.link.bomberos.title',
    descriptionKey: 'resources.link.bomberos.desc',
    titleFallback: 'Bomberos del Distrito Capital',
    descriptionFallback: 'Cuerpo de bomberos de Caracas. Emergencias por derrumbe, rescate, incendio.',
    url: 'https://www.bomberosdc.gob.ve/',
  },
  {
    titleKey: 'resources.link.inameh.title',
    descriptionKey: 'resources.link.inameh.desc',
    titleFallback: 'INAMEH — Instituto Nacional de Meteorología e Hidrología',
    descriptionFallback: 'Pronóstico oficial del clima y alerta de réplicas / lluvia (riesgo de deslaves).',
    url: 'https://www.inameh.gob.ve/',
  },
  {
    titleKey: 'resources.link.usgs.title',
    descriptionKey: 'resources.link.usgs.desc',
    titleFallback: 'USGS — Detalle del evento sísmico',
    descriptionFallback: 'Información técnica oficial del terremoto M 7.5 del 24/06/2026 (USGS Earthquake Hazards Program).',
    url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us6000t7zp/executive',
  },
];

@Component({
  selector: 'app-resources',
  standalone: true,
  template: `
    <div class="cm-backdrop" (click)="close.emit()"></div>
    <div class="cm-resources" role="dialog" [attr.aria-label]="i18n.t('resources.title')">
      <header>
        <h3>{{ i18n.t('resources.title') }}</h3>
        <button class="cm-close" (click)="close.emit()" [attr.aria-label]="i18n.t('common.close')">×</button>
      </header>

      <p class="cm-disclaimer" [innerHTML]="disclaimerText()"></p>

      <ul class="cm-linklist">
        @for (link of links; track link.url) {
          <li>
            <a [href]="link.url" target="_blank" rel="noopener noreferrer">
              <span class="cm-link-title">{{ i18n.t(link.titleKey) || link.titleFallback }}</span>
              @if (link.badgeKey) {
                <span class="cm-badge">{{ i18n.t(link.badgeKey) || link.badgeFallback }}</span>
              }
              <span class="cm-link-desc">{{ i18n.t(link.descriptionKey) || link.descriptionFallback }}</span>
              <span class="cm-link-url">{{ link.url }}</span>
            </a>
          </li>
        }
      </ul>

      <p class="cm-disclaimer cm-disclaimer-footer">{{ i18n.t('resources.disclaimer.footer') }}</p>

      <button class="cm-btn" (click)="close.emit()">{{ i18n.t('resources.close') }}</button>
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
    .cm-disclaimer :global(strong) { font-weight: 700; }
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
  readonly i18n = inject(I18nService);
  readonly close = output<void>();
  readonly links = LINKS;
  readonly disclaimerText = computed(() => this.i18n.t('resources.disclaimer'));
}