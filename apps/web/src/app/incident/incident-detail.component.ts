import { Component, input, output, inject, signal } from '@angular/core';
import { ApiClientService } from '../core/api-client.service';
import { I18nService } from '../core/i18n.service';
import type { ConfirmationAction } from '../shared/constants';

@Component({
  selector: 'app-incident-detail',
  standalone: true,
  template: `
    <div class="cm-modal">
      <div class="cm-modal-box">
        <h3>{{ i18n.t('type.' + (incident()?.type ?? '')) || incident()?.type }}</h3>
        <p class="cm-conf">{{ i18n.t('incident.confirmedBy', { n: incident()?.confirmations ?? 0 }) }}</p>
        @if (incident()?.description) { <p>{{ incident()?.description }}</p> }
        <h4>{{ i18n.t('incident.title') }}</h4>
        <div class="cm-verify">
          <button (click)="act('confirm')">{{ i18n.t('incident.confirm') }}</button>
          <button (click)="act('improved')">{{ i18n.t('incident.improved') }}</button>
          <button (click)="act('worsened')">{{ i18n.t('incident.worsened') }}</button>
          <button (click)="act('no_longer_exists')">{{ i18n.t('incident.gone') }}</button>
        </div>
        @if (msg()) { <p class="cm-msg">{{ msg() }}</p> }
        <button class="cm-close" (click)="close.emit()">{{ i18n.t('incident.close') }}</button>
      </div>
    </div>
  `,
  styles: [`
    .cm-modal { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 1300;
      display: flex; align-items: center; justify-content: center; }
    .cm-modal-box { background: #fff; padding: 20px; border-radius: 12px; max-width: 380px; width: 90%; }
    .cm-conf { font-weight: 700; color: #2e7d32; }
    h4 { margin: 16px 0 8px; }
    .cm-verify { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .cm-verify button { padding: 14px; font-size: 15px; border: none; border-radius: 8px;
      background: #1976d2; color: #fff; cursor: pointer; }
    .cm-msg { color: #2e7d32; font-weight: 600; }
    .cm-close { margin-top: 16px; width: 100%; padding: 12px; border: none; border-radius: 8px;
      background: #eee; cursor: pointer; font-size: 16px; }
  `],
})
export class IncidentDetailComponent {
  readonly incident = input<{ incidentId: string; type: string; confirmations: number; description?: string } | null>(null);
  readonly close = output<void>();
  private api = inject(ApiClientService);
  readonly i18n = inject(I18nService);
  readonly msg = signal('');

  async act(action: ConfirmationAction): Promise<void> {
    const id = this.incident()?.incidentId;
    if (!id) return;
    try {
      await this.api.confirm(id, action);
      this.msg.set(action === 'no_longer_exists' ? '✓' : '✓');
    } catch (e) {
      this.msg.set(this.i18n.t('incident.alreadyVerified'));
    }
  }
}