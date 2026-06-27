import { Component, output, input, inject } from '@angular/core';
import { ApiClientService } from '../core/api-client.service';

@Component({
  selector: 'app-duplicate-prompt',
  standalone: true,
  template: `
    <div class="cm-modal">
      <div class="cm-modal-box">
        <h3>Similar incident nearby</h3>
        <p>A similar incident already exists near this location.</p>
        <div class="cm-actions">
          <button class="cm-btn cm-btn-ghost" (click)="createNew.emit()">Create new</button>
          <button class="cm-btn" (click)="confirmExisting()">Confirm existing</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .cm-modal { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 1300;
      display: flex; align-items: center; justify-content: center; }
    .cm-modal-box { background: #fff; padding: 24px; border-radius: 12px; max-width: 360px; text-align: center; }
    .cm-actions { display: flex; gap: 12px; margin-top: 16px; }
    .cm-btn { flex: 1; padding: 14px; font-size: 16px; border: none; border-radius: 8px;
      background: #1976d2; color: #fff; cursor: pointer; }
    .cm-btn-ghost { background: #eee; color: #333; }
  `],
})
export class DuplicatePromptComponent {
  readonly incidentId = input.required<string>();
  readonly createNew = output<void>();
  readonly resolved = output<void>();
  private api = inject(ApiClientService);

  async confirmExisting(): Promise<void> {
    try { await this.api.confirm(this.incidentId(), 'confirm'); } catch { /* ignore */ }
    this.resolved.emit();
  }
}
