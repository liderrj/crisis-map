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

@Injectable({ providedIn: 'root' })
export class StorageService {
  private dbPromise!: Promise<IDBPDatabase>;

  private async db(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB('crisismap', 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('incidents')) {
            db.createObjectStore('incidents', { keyPath: 'incidentId' });
          }
          if (!db.objectStoreNames.contains('outbox')) {
            db.createObjectStore('outbox', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('device')) {
            db.createObjectStore('device');
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

  async getCachedIncidents(): Promise<Incident[]> {
    const db = await this.db();
    return (await db.getAll('incidents')) as Incident[];
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
}
