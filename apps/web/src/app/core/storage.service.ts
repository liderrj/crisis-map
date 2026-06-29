import { Injectable } from '@angular/core';
import { openDB, type IDBPDatabase } from 'idb';
import type { Incident } from '../shared/constants';

export type OutboxOp = 'create_incident' | 'confirm' | 'upload_image';

export interface OutboxEntry {
  id: string;
  op: OutboxOp;
  payload: unknown;
  createdAt: number;
}

export interface PendingImage {
  outboxId: string;
  incidentId: string | null;
  blobs: Blob[];
  createdAt: number;
  /** How many times flushPendingFor has tried to upload this entry. */
  attempts?: number;
}

@Injectable({ providedIn: 'root' })
export class StorageService {
  private dbPromise!: Promise<IDBPDatabase>;

  private async db(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB('crisismap', 3, {
        upgrade(db, oldVersion) {
          if (oldVersion < 1) {
            if (!db.objectStoreNames.contains('incidents')) {
              db.createObjectStore('incidents', { keyPath: 'incidentId' });
            }
            if (!db.objectStoreNames.contains('outbox')) {
              db.createObjectStore('outbox', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('device')) {
              db.createObjectStore('device');
            }
          }
          if (oldVersion < 2) {
            if (!db.objectStoreNames.contains('tiles')) {
              db.createObjectStore('tiles');
            }
          }
          if (oldVersion < 3) {
            if (!db.objectStoreNames.contains('pendingImages')) {
              db.createObjectStore('pendingImages', { keyPath: 'outboxId' });
            }
          }
        },
      });
    }
    return this.dbPromise;
  }

  async cacheIncidents(incidents: Incident[]): Promise<void> {
    const db = await this.db();
    const tx = db.transaction('incidents', 'readwrite');
    for (const i of incidents) await tx.store.put(i);
    await tx.done;
  }

  /**
   * Remove every cached incident that was created in demo mode. Called
   * when the user exits demo mode so the next page load does not
   * surface demo data through stale caches. Idempotent.
   *
   * Note: cacheIncidents() above uses `put` (upsert by incidentId).
   * After a real-mode re-fetch it overwrites matching rows but never
   * removes rows it does not see — including the demo ones from a
   * previous session — so this method is the only thing that evicts
   * demo-tagged rows from the cache.
   */
  async clearDemoIncidents(): Promise<void> {
    const db = await this.db();
    const all = (await db.getAll('incidents')) as Incident[];
    const toDelete = all.filter(
      (i) => (i as Incident & { isDemo?: boolean }).isDemo === true,
    );
    if (toDelete.length === 0) return;
    const tx = db.transaction('incidents', 'readwrite');
    for (const i of toDelete) await tx.store.delete(i.incidentId);
    await tx.done;
  }

  async getCachedIncidents(): Promise<Incident[]> {
    const db = await this.db();
    return (await db.getAll('incidents')) as Incident[];
  }

  async getIncident(incidentId: string): Promise<Incident | undefined> {
    const db = await this.db();
    return (await db.get('incidents', incidentId)) as Incident | undefined;
  }

  async putIncident(incident: Incident): Promise<void> {
    const db = await this.db();
    await db.put('incidents', incident);
  }

  async deleteIncident(incidentId: string): Promise<void> {
    const db = await this.db();
    await db.delete('incidents', incidentId);
  }

  async addOutbox(entry: OutboxEntry): Promise<void> {
    const db = await this.db();
    await db.put('outbox', entry);
  }

  async getOutbox(): Promise<OutboxEntry[]> {
    const db = await this.db();
    return (await db.getAll('outbox')) as OutboxEntry[];
  }

  async removeOutbox(id: string): Promise<void> {
    const db = await this.db();
    await db.delete('outbox', id);
  }

  async addPendingImage(entry: PendingImage): Promise<void> {
    const db = await this.db();
    await db.put('pendingImages', entry);
  }

  async getPendingImages(): Promise<PendingImage[]> {
    const db = await this.db();
    return (await db.getAll('pendingImages')) as PendingImage[];
  }

  async getPendingImage(outboxId: string): Promise<PendingImage | undefined> {
    const db = await this.db();
    return (await db.get('pendingImages', outboxId)) as PendingImage | undefined;
  }

  /**
   * Update only the server-assigned incidentId on a pending image
   * entry. Called by the sync engine once the parent create_incident
   * op gets back a real ID from the server. We keep the blobs intact
   * so the next pass can attempt the S3 PUT.
   */
  async setPendingImageIncidentId(outboxId: string, incidentId: string): Promise<void> {
    const db = await this.db();
    const existing = (await db.get('pendingImages', outboxId)) as PendingImage | undefined;
    if (!existing) return;
    existing.incidentId = incidentId;
    await db.put('pendingImages', existing);
  }

  /**
   * Bump the attempts counter on a pending image entry. Used by
   * ImageUploadService to cap the number of retries before giving
   * up on a permanently-failing entry (e.g. server rejected the
   * upload URLs).
   */
  async setPendingImageAttempts(outboxId: string, attempts: number): Promise<void> {
    const db = await this.db();
    const existing = (await db.get('pendingImages', outboxId)) as PendingImage | undefined;
    if (!existing) return;
    existing.attempts = attempts;
    await db.put('pendingImages', existing);
  }

  async deletePendingImage(outboxId: string): Promise<void> {
    const db = await this.db();
    await db.delete('pendingImages', outboxId);
  }

  async getKeyAsString(key: string): Promise<string | null> {
    const db = await this.db();
    const v = await db.get('tiles', key);
    return typeof v === 'string' ? v : null;
  }

  async setKeyAsString(key: string, value: string): Promise<void> {
    const db = await this.db();
    await db.put('tiles', value, key);
  }
}
