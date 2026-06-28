import { Component, output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../core/i18n.service';
import { ApiClientService } from '../core/api-client.service';
import { DeviceIdService } from '../core/device-id.service';

interface SubjectOption {
  key: string;
  fallback: string;
}

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="cm-backdrop" (click)="close.emit()"></div>
    <div class="cm-contact" role="dialog" [attr.aria-label]="i18n.t('contact.title')" (click)="$event.stopPropagation()">
      <header>
        <h3>{{ i18n.t('contact.title') }}</h3>
        <button class="cm-close" (click)="close.emit()" [attr.aria-label]="i18n.t('common.close')">×</button>
      </header>

      <div class="cm-body">
        @if (status() === 'sent') {
          <p class="cm-success">{{ i18n.t('contact.sent') }}</p>
        } @else {
          <p class="cm-preview">{{ i18n.t('contact.preview') }}</p>

          <label>{{ i18n.t('contact.subject') }}
            <select [(ngModel)]="subjectKey">
              @for (s of subjects; track s.key) {
                <option [value]="s.key">{{ i18n.t(s.key) || s.fallback }}</option>
              }
            </select>
          </label>

          <label>{{ i18n.t('contact.message') }}
            <textarea [(ngModel)]="message" rows="6"
              [placeholder]="i18n.t('contact.message.placeholder')"></textarea>
          </label>

          <details class="cm-advanced">
            <summary>{{ i18n.t('contact.advanced') }}</summary>
            <label class="cm-inline-label">
              <span>{{ i18n.t('contact.alias') }}</span>
              <input type="text" [(ngModel)]="alias" maxlength="30" />
            </label>
          </details>

          @if (status() === 'error') {
            <p class="cm-error">{{ i18n.t('contact.error') }}</p>
          }
        }
      </div>

      <footer>
        @if (status() === 'sent') {
          <button class="cm-btn cm-btn-primary" (click)="close.emit()">{{ i18n.t('contact.close') }}</button>
        } @else {
          <button class="cm-btn cm-btn-ghost" (click)="close.emit()">{{ i18n.t('common.cancel') }}</button>
          <button class="cm-btn cm-btn-primary" (click)="send()" [disabled]="status() === 'sending'">
            {{ status() === 'sending' ? i18n.t('contact.sending') : i18n.t('contact.send') }}
          </button>
        }
      </footer>
    </div>
  `,
  styles: [`
    .cm-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 1100; }
    .cm-contact {
      position: fixed; top: 5vh; left: 50%; transform: translateX(-50%);
      width: min(92vw, 520px); max-height: 92vh;
      background: #fff; border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,.4);
      display: flex; flex-direction: column;
      z-index: 1101; overflow: hidden;
    }
    header { display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px; border-bottom: 1px solid #eee; background: #00838f; color: #fff; }
    header h3 { margin: 0; font-size: 18px; }
    .cm-close { background: transparent; color: #fff; border: none;
      font-size: 24px; line-height: 1; cursor: pointer; padding: 0 8px; }
    .cm-body { padding: 16px 20px; overflow-y: auto; flex: 1; display: flex;
      flex-direction: column; gap: 12px; }
    .cm-preview {
      background: #e0f7fa; color: #006064; padding: 10px 12px;
      border-radius: 6px; font-size: 13px; margin: 0;
    }
    .cm-success {
      background: #e6f7e6; color: #1b5e20; padding: 20px 16px;
      border-radius: 6px; font-size: 15px; text-align: center; margin: 0;
    }
    .cm-error {
      background: #fdecea; color: #b71c1c; padding: 10px 12px;
      border-radius: 6px; font-size: 13px; margin: 0;
    }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; font-weight: 600; }
    label.cm-inline-label { flex-direction: row; align-items: center; gap: 8px; font-size: 13px; }
    label.cm-inline-label span { min-width: 110px; font-weight: 600; }
    label.cm-inline-label input { flex: 1; }
    select, textarea, input {
      padding: 10px; font-size: 15px; border: 2px solid #ccc; border-radius: 6px;
      width: 100%; box-sizing: border-box; font-family: inherit;
    }
    textarea { resize: vertical; min-height: 120px; }
    .cm-advanced { margin-top: 8px; }
    .cm-advanced summary { cursor: pointer; font-size: 13px; color: #555;
      padding: 6px 0; user-select: none; }
    .cm-advanced[open] summary { margin-bottom: 8px; }
    footer { padding: 14px 20px; border-top: 1px solid #eee; background: #fafafa;
      display: flex; gap: 8px; }
    .cm-btn { flex: 1; padding: 14px; font-size: 15px; font-weight: 600;
      border: none; border-radius: 6px; cursor: pointer; text-align: center;
      text-decoration: none; display: inline-block; }
    .cm-btn-primary { background: #00838f; color: #fff; }
    .cm-btn-primary:disabled { opacity: 0.6; cursor: default; }
    .cm-btn-ghost { background: transparent; color: #c62828; border: 1px solid #c62828; }
  `],
})
export class ContactComponent {
  readonly i18n = inject(I18nService);
  readonly api = inject(ApiClientService);
  readonly device = inject(DeviceIdService);
  readonly close = output<void>();

  readonly subjects: SubjectOption[] = [
    { key: 'contact.subject.bug', fallback: 'Reportar un error / problema técnico' },
    { key: 'contact.subject.safety', fallback: 'Reportar uso inapropiado / abuso' },
    { key: 'contact.subject.coordinate', fallback: 'Coordinar ayuda en zona' },
    { key: 'contact.subject.press', fallback: 'Prensa / medios' },
    { key: 'contact.subject.other', fallback: 'Otro asunto' },
  ];

  readonly subjectKey = signal('contact.subject.bug');
  readonly message = signal('');
  readonly alias = signal('');
  readonly status = signal<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async send(): Promise<void> {
    if (this.status() === 'sending') return;
    const msg = this.message().trim();
    if (!msg) return;

    this.status.set('sending');
    const ok = await this.api.sendContact({
      subject: this.subjectLabel(),
      message: msg,
      alias: this.device.device().alias || this.alias().trim() || undefined,
      locale: this.i18n.locale(),
    });
    this.status.set(ok ? 'sent' : 'error');
  }

  private subjectLabel(): string {
    const found = this.subjects.find((s) => s.key === this.subjectKey());
    return this.i18n.t(found?.key ?? 'contact.subject.other') || found?.fallback || '';
  }
}