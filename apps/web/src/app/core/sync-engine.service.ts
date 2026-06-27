import { Injectable, inject } from '@angular/core';
import { ApiClientService } from './api-client.service';
import { StorageService } from './storage.service';

const SYNC_INTERVAL_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class SyncEngineService {
  private api = inject(ApiClientService);
  private storage = inject(StorageService);
  private timer?: ReturnType<typeof setInterval>;
  private syncing = false;

  start(): void {
    this.syncNow();
    window.addEventListener('online', () => this.syncNow());
    this.timer = setInterval(() => {
      if (navigator.onLine) this.syncNow();
    }, SYNC_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  scheduleSync(): void {
    if (navigator.onLine) this.syncNow();
  }

  async syncNow(): Promise<void> {
    if (this.syncing) return;
    const outbox = await this.storage.getOutbox();
    if (!outbox.length) return;

    this.syncing = true;
    try {
      const operations = outbox.map((e) => ({ op: e.op, payload: e.payload }));
      const res = await this.api.sync(operations);
      const results = (res as { results?: Array<Record<string, unknown>> }).results ?? [];

      for (let i = 0; i < outbox.length && i < results.length; i++) {
        const status = String(results[i]['status'] ?? 'error');
        if (status === 'created' || status === 'applied' || status === 'duplicate' || status === 'conflict') {
          await this.storage.removeOutbox(outbox[i].id);
        }
      }
    } catch {
      // offline or server error - keep outbox for next attempt
    } finally {
      this.syncing = false;
    }
  }
}
