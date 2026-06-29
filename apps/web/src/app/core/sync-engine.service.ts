import { Injectable, inject, signal } from '@angular/core';
import { ApiClientService } from './api-client.service';
import { StorageService } from './storage.service';
import { NetworkService } from './network.service';
import { ImageUploadService } from '../report/image-upload.service';

const INITIAL_DELAY_MS = 30_000;
const MAX_DELAY_MS = 30 * 60_000;
const BACKOFF_MULTIPLIER = 2;

type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

@Injectable({ providedIn: 'root' })
export class SyncEngineService {
  private api = inject(ApiClientService);
  private storage = inject(StorageService);
  private network = inject(NetworkService);
  private images = inject(ImageUploadService);

  readonly status = signal<SyncStatus>('idle');

  private nextDelay = INITIAL_DELAY_MS;
  private timer?: ReturnType<typeof setTimeout>;
  private syncing = false;
  private listenersBound = false;

  start(): void {
    if (this.listenersBound) return;
    this.listenersBound = true;

    window.addEventListener('online', () => {
      this.nextDelay = INITIAL_DELAY_MS;
      void this.syncNow();
    });
    window.addEventListener('offline', () => {
      this.status.set('offline');
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = undefined;
      }
    });

    if (this.network.isOnline()) {
      this.status.set('idle');
      void this.syncNow();
    } else {
      this.status.set('offline');
    }
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  scheduleSync(): void {
    if (!this.network.isOnline()) {
      this.status.set('offline');
      return;
    }
    if (!this.timer) {
      void this.syncNow();
    }
  }

  async syncNow(): Promise<void> {
    if (this.syncing) return;
    if (!this.network.isOnline()) {
      this.status.set('offline');
      return;
    }

    this.syncing = true;
    this.status.set('syncing');
    try {
      const drained = await this.drainTextOutbox();
      // Always sweep for orphaned pending images. Some uploads may
      // have failed on a previous cycle and survived in IndexedDB
      // (the S3 PUT can fail and the image stays for the next attempt).
      await this.retryPendingImages();
      if (drained) {
        this.nextDelay = INITIAL_DELAY_MS;
      }
      this.status.set('idle');
      this.scheduleNext();
    } catch {
      this.status.set('error');
      this.scheduleNextWithBackoff();
    } finally {
      this.syncing = false;
    }
  }

  private async drainTextOutbox(): Promise<boolean> {
    const outbox = await this.storage.getOutbox();
    if (!outbox.length) return false;

    const operations = outbox.map((e) => ({ op: e.op, payload: e.payload }));
    const res = await this.api.sync(operations);
    const results = (res as { results?: Array<Record<string, unknown>> }).results ?? [];

    for (let i = 0; i < outbox.length && i < results.length; i++) {
      const entry = outbox[i];
      const result = results[i];
      const status = String(result['status'] ?? 'error');
      if (status === 'created' || status === 'applied' || status === 'duplicate' || status === 'conflict') {
        await this.storage.removeOutbox(entry.id);
        await this.onSyncSuccess(entry, result);
      } else if (status === 'demo_limit') {
        // Backend refused: this device's demo quota is exhausted.
        // Remove the op from the outbox so we don't retry forever;
        // the user will see the error toast from the report form.
        await this.storage.removeOutbox(entry.id);
      }
    }

    return true;
  }

  private async onSyncSuccess(entry: OutboxEntrySync, result: Record<string, unknown>): Promise<void> {
    if (entry.op !== 'create_incident') return;
    const payload = entry.payload as { outboxId?: string; type: string; severity: string; location: { lat: number; lng: number }; description?: string };
    if (!payload.outboxId) return;

    const serverId = result['incidentId'] as string | undefined;
    const duplicateOf = result['duplicateOf'] as string | undefined;

    const localIncident = await this.storage.getIncident(payload.outboxId);
    if (!localIncident) return;

    await this.storage.deleteIncident(payload.outboxId);
    if (serverId) {
      const resolved: Incident & { __pending?: boolean } = {
        ...localIncident,
        incidentId: serverId,
        confirmations: localIncident.confirmations,
        negativeVotes: localIncident.negativeVotes ?? 0,
        status: localIncident.status,
        creatorAlias: localIncident.creatorAlias,
        creatorDeviceId: localIncident.creatorDeviceId,
        createdAt: localIncident.createdAt,
        updatedAt: localIncident.updatedAt,
        expiresAt: localIncident.expiresAt,
        imageCount: localIncident.imageCount,
        type: localIncident.type,
        severity: localIncident.severity,
        category: localIncident.category,
        location: localIncident.location,
        geohash: localIncident.geohash,
        description: localIncident.description,
        __pending: false,
      };
      delete resolved.__pending;
      await this.storage.putIncident(resolved as Incident);

      // Upload any pending images for this incident. We:
      //   1) Update the pending image entry's incidentId so a future
      //      retry pass can find it (orphan-resilient).
      //   2) Hand the blobs to ImageUploadService, which uploads to
      //      S3 and deletes the pending entry on success.
      //   If the upload fails, the pending entry stays in IndexedDB
      //   and the next retryPendingImages() sweep will try again.
      await this.storage.setPendingImageIncidentId(payload.outboxId, serverId);
      await this.images.flushPendingFor(payload.outboxId, serverId);
    } else if (duplicateOf) {
      // The server already had this report. Drop our local copy and
      // any photos we had queued for it (we don't want to attach them
      // to the duplicate).
      await this.storage.deleteIncident(payload.outboxId);
      await this.storage.deletePendingImage(payload.outboxId);
    }
  }

  /**
   * Sweep every pending image entry and try to upload any that already
   * have a server-assigned incidentId. This handles two cases the
   * happy-path `onSyncSuccess` doesn't cover:
   *
   *   1. ImageUploadService.flushPendingFor threw during a previous
   *      cycle (S3 blip, 5xx, network drop mid-upload). The pending
   *      entry is left in IndexedDB so we can try again.
   *   2. The user re-opens the app days later and there are stale
   *      entries that didn't make it to S3.
   */
  private async retryPendingImages(): Promise<void> {
    const pending = await this.storage.getPendingImages();
    for (const p of pending) {
      if (!p.incidentId) continue;
      await this.images.flushPendingFor(p.outboxId, p.incidentId);
    }
  }

  private scheduleNext(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.syncNow(), INITIAL_DELAY_MS);
  }

  private scheduleNextWithBackoff(): void {
    if (this.timer) clearTimeout(this.timer);
    const delay = this.nextDelay;
    this.nextDelay = Math.min(this.nextDelay * BACKOFF_MULTIPLIER, MAX_DELAY_MS);
    this.timer = setTimeout(() => void this.syncNow(), delay);
  }
}

type OutboxEntrySync = {
  id: string;
  op: 'create_incident' | 'confirm' | 'upload_image';
  payload: unknown;
  createdAt: number;
};

type Incident = import('../shared/constants').Incident;
