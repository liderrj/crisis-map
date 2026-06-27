import { Injectable, inject } from '@angular/core';
import { ApiClientService } from '../core/api-client.service';
import { compressImage } from './image-compress';

@Injectable({ providedIn: 'root' })
export class ImageUploadService {
  private api = inject(ApiClientService);

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
