import { Component, input, output, inject, signal } from '@angular/core';
import { ApiClientService } from '../core/api-client.service';
import type { ConfirmationAction } from '../shared/constants';

@Component({
  selector: 'app-incident-detail',
  standalone: true,
  template: `
    <div class="cm-modal">
      <div class="cm-modal-box">
        <h3>{{ incident()?.type?.replace(/_/g, ' ') }}</h3>
        <p class="cm-conf">Confirmed by {{ incident()?.confirmations }} people</p>
        @if (incident()?.description) { <p>{{ incident()?.description }}</p> }
        <h4>Verify this report</h4>
        <div class="cm-verify">
          <button (click)="act('confirm')">Confirm</button>
          <button (click)="act('improved')">Improved</button>
          <button (click)="act('worsened')">Worsened</button>
          <button (click)="act('no_longer_exists')">Gone</button>
        </div>
        @if (msg()) { <p class="cm-msg">{{ msg() }}</p> }
        <button class="cm-close" (click)="close.emit()">Close</button>
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
  readonly msg = signal('');

  async act(action: ConfirmationAction): Promise<void> {
    const id = this.incident()?.incidentId;
    if (!id) return;
    try {
      await this.api.confirm(id, action);
      this.msg.set(action === 'no_longer_exists' ? 'Marked as no longer exists.' : 'Verified. Thank you.');
    } catch (e) {
      this.msg.set((e as Error).message?.includes('409') ? 'Already verified from this device.' : 'Could not verify.');
    }
  }
}
