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
      if (drained) {
        await this.flushImages();
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
      await this.storage.deletePendingImage(payload.outboxId);
    } else if (duplicateOf) {
      await this.storage.deleteIncident(payload.outboxId);
    }
  }

  private async flushImages(): Promise<void> {
    const outbox = await this.storage.getOutbox();
    for (const entry of outbox) {
      if (entry.op !== 'create_incident') continue;
      const payload = entry.payload as { outboxId?: string };
      if (!payload.outboxId) continue;
      const serverIncident = await this.storage.getIncident(payload.outboxId);
      if (!serverIncident) continue;
      await this.images.flushPendingFor(payload.outboxId, serverIncident.incidentId);
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
