import { Component, output, input, inject } from '@angular/core';
import { StorageService } from '../core/storage.service';
import { SyncEngineService } from '../core/sync-engine.service';
import { I18nService } from '../core/i18n.service';

@Component({
  selector: 'app-duplicate-prompt',
  standalone: true,
  template: `
    <div class="cm-modal">
      <div class="cm-modal-box">
        <h3>{{ i18n.t('duplicate.title') }}</h3>
        <p>{{ i18n.t('duplicate.body') }}</p>
        <div class="cm-actions">
          <button class="cm-btn cm-btn-ghost" (click)="createNew.emit()">{{ i18n.t('duplicate.createNew') }}</button>
          <button class="cm-btn" (click)="confirmExisting()">{{ i18n.t('duplicate.confirmExisting') }}</button>
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
  private storage = inject(StorageService);
  private sync = inject(SyncEngineService);
  readonly i18n = inject(I18nService);

  async confirmExisting(): Promise<void> {
    // Always go through the outbox; sync engine will POST /sync later.
    await this.storage.addOutbox({
      id: crypto.randomUUID(),
      op: 'confirm',
      payload: { incidentId: this.incidentId(), action: 'confirm' },
      createdAt: Date.now(),
    });
    // Optimistic local update.
    const inc = await this.storage.getIncident(this.incidentId());
    if (inc) {
      await this.storage.putIncident({
        ...inc,
        confirmations: (inc.confirmations ?? 0) + 1,
        updatedAt: Math.floor(Date.now() / 1000),
      });
    }
    this.sync.scheduleSync();
    this.resolved.emit();
  }
}
