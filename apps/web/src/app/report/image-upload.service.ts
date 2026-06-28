import { Injectable, inject } from '@angular/core';
import { ApiClientService } from '../core/api-client.service';
import { StorageService } from '../core/storage.service';
import { compressImage } from './image-compress';

@Injectable({ providedIn: 'root' })
export class ImageUploadService {
  private api = inject(ApiClientService);
  private storage = inject(StorageService);

  /**
   * Compresses the files and queues them as blobs in IndexedDB,
   * linked to the parent outbox entry. Does NOT call the network.
   * Safe to call from the form submit handler whether online or offline.
   */
  async enqueue(outboxId: string, files: Blob[]): Promise<void> {
    if (!files.length) return;
    const compressed = await Promise.all(files.map((f) => compressImage(f)));
    await this.storage.addPendingImage({
      outboxId,
      incidentId: null,
      blobs: compressed,
      createdAt: Date.now(),
    });
  }

  /**
   * Called by the sync engine after the parent report has been assigned
   * a server incidentId. Uploads the queued blobs to S3 and removes
   * the pending entry. Idempotent: safe to retry.
   */
  async flushPendingFor(outboxId: string, serverIncidentId: string): Promise<void> {
    const pending = await this.storage.getPendingImage(outboxId);
    if (!pending || !pending.blobs.length) return;
    if (!serverIncidentId) return;

    try {
      const urls = await this.api.requestUploadUrls(serverIncidentId, pending.blobs.length);
      if (!urls?.length) {
        throw new Error('No upload URLs returned');
      }
      const failures: number[] = [];
      await Promise.all(
        pending.blobs.map(async (blob, i) => {
          const target = urls[i];
          if (!target) {
            failures.push(i);
            return;
          }
          const ok = await this.api.uploadImage(target.url, blob);
          if (!ok) failures.push(i);
        }),
      );
      if (failures.length) {
        throw new Error(`${failures.length} image(s) failed to upload`);
      }
      await this.storage.deletePendingImage(outboxId);
    } catch {
      // Keep the pending entry for the next sync attempt.
    }
  }

  /**
   * Legacy direct upload path (used for the duplicate-prompt case where
   * the report already exists on the server and we only want to attach
   * extra photos). Not used by the offline-first submit path.
   */
  async upload(incidentId: string, files: Blob[]): Promise<void> {
    if (!files.length) return;
    const compressed = await Promise.all(files.map((f) => compressImage(f)));
    const urls = await this.api.requestUploadUrls(incidentId, compressed.length);

    const failures: number[] = [];
    await Promise.all(
      compressed.map(async (blob, i) => {
        const ok = await this.api.uploadImage(urls[i].url, blob);
        if (!ok) failures.push(i);
      }),
    );

    if (failures.length) {
      throw new Error(`${failures.length} image(s) failed to upload; will retry later`);
    }
  }
}
