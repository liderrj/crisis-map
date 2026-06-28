import { Injectable, inject } from '@angular/core';
import { ApiClientService } from '../core/api-client.service';
import { StorageService } from '../core/storage.service';
import { compressImage } from './image-compress';

// Max times we'll retry a single pending image before giving up.
// At 30s backoff between sync cycles, 10 attempts = ~5 minutes, then
// the entry is dropped so the user isn't stuck forever.
const MAX_ATTEMPTS = 10;

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
   * the pending entry.
   *
   * Failure handling:
   * - Per-blob PUT failures are retried by the SW network layer; we
   *   drop the whole batch only if at least one blob failed to upload
   *   to a presigned URL we got back.
   * - If the server returns a 4xx (e.g. the incident hit the
   *   per-incident image limit, or the incidentId was deleted), we
   *   drop the pending entry and log a warning so the user isn't
   *   stuck retrying forever.
   * - Transient 5xx / network errors keep the pending entry and
   *   bump a retry counter. After MAX_ATTEMPTS the entry is also
   *   dropped to avoid permanent stuck state.
   */
  async flushPendingFor(outboxId: string, serverIncidentId: string): Promise<void> {
    const pending = await this.storage.getPendingImage(outboxId);
    if (!pending || !pending.blobs.length) return;
    if (!serverIncidentId) return;

    let urls: { url: string; key: string }[];
    try {
      urls = await this.api.requestUploadUrls(serverIncidentId, pending.blobs.length);
    } catch (err: any) {
      const status = err?.status ?? 0;
      if (status >= 400 && status < 500) {
        // Server explicitly rejected (limit, missing incident, etc.).
        // Retrying won't help; drop the entry and log.
        console.warn(
          `[image-upload] server rejected upload URLs for ${outboxId} (status ${status}): ${err?.message ?? err}. Dropping pending image.`,
        );
        await this.storage.deletePendingImage(outboxId);
        return;
      }
      // Transient 5xx / network — keep for retry.
      return;
    }

    if (!urls?.length) {
      console.warn(`[image-upload] empty upload URL list for ${outboxId}. Keeping pending image.`);
      return;
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
      const attempts = (pending.attempts ?? 0) + 1;
      await this.storage.setPendingImageAttempts(outboxId, attempts);
      if (attempts >= MAX_ATTEMPTS) {
        console.warn(
          `[image-upload] ${failures.length}/${pending.blobs.length} blob(s) failed after ${attempts} attempts for ${outboxId}. Dropping pending image.`,
        );
        await this.storage.deletePendingImage(outboxId);
      } else {
        console.warn(
          `[image-upload] ${failures.length}/${pending.blobs.length} blob(s) failed (attempt ${attempts}/${MAX_ATTEMPTS}) for ${outboxId}. Will retry.`,
        );
      }
      return;
    }

    await this.storage.deletePendingImage(outboxId);
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
