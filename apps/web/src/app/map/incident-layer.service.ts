import { Injectable, inject } from '@angular/core';
import { ApiClientService } from '../core/api-client.service';
import { StorageService } from '../core/storage.service';
import { IncidentCacheService } from '../core/incident-cache.service';
import { NetworkService } from '../core/network.service';
import type { Incident, IncidentType } from '../shared/constants';
import type { IncidentCategory } from '../shared/constants';

export interface FilterState {
  categories: Set<IncidentCategory>;
  confirmedOnly: boolean;
  types: Set<IncidentType>;
}

@Injectable({ providedIn: 'root' })
export class IncidentLayerService {
  private api = inject(ApiClientService);
  private storage = inject(StorageService);
  private cache = inject(IncidentCacheService);
  private network = inject(NetworkService);

  async loadBbox(
    bbox: string,
    filters: FilterState,
    onUpdate?: (incidents: Incident[]) => void,
  ): Promise<{ incidents: Incident[]; hadCache: boolean }> {
    const bounds = this.parseBbox(bbox);

    const cached = await this.cache.read(bounds);
    const hadCache = cached.found;
    const cachedFiltered = this.applyFilters(cached.incidents, filters);
    const coolingDown = await this.cache.isCoolingDown();

    // Fresh cache or rate-limited: serve from cache only.
    if (!cached.stale || coolingDown) {
      return { incidents: cachedFiltered, hadCache };
    }

    // Stale but offline: serve from cache, do not even try network.
    if (!this.network.isOnline()) {
      return { incidents: cachedFiltered, hadCache };
    }

    void this.revalidate(bounds, filters).then((fresh) => {
      if (fresh.length > 0 && onUpdate) {
        const filtered = this.applyFilters(fresh, filters);
        onUpdate(filtered);
      }
    });

    return { incidents: cachedFiltered, hadCache };
  }

  private async revalidate(
    bounds: { west: number; south: number; east: number; north: number },
    filters: FilterState,
  ): Promise<Incident[]> {
    // Re-check online state at the start of the call.
    if (!this.network.isOnline()) return [];

    try {
      const cached = await this.cache.read(bounds);
      const etag = cached.found ? await this.cache.getEtag(bounds) : undefined;
      const res = await this.api.getIncidents({
        bbox: this.bboxFromBounds(bounds),
        limit: 200,
        confirmedOnly: filters.confirmedOnly,
        etag,
      });
      if (res.rateLimited) {
        await this.cache.setCooldown();
        return [];
      }
      if (res.notModified) {
        return cached.incidents;
      }
      await this.cache.write(bounds, res.incidents, res.etag);
      await this.storage.cacheIncidents(res.incidents);
      return res.incidents;
    } catch {
      return [];
    }
  }

  async getCached(): Promise<Incident[]> {
    return this.storage.getCachedIncidents();
  }

  async getPendingIncidents(): Promise<Incident[]> {
    const all = await this.storage.getCachedIncidents();
    return all.filter((i) => (i as Incident & { __pending?: boolean }).__pending === true) as Incident[];
  }

  applyFilters(incidents: Incident[], filters: FilterState): Incident[] {
    return incidents.filter((i) => {
      if (filters.types.size > 0 && !filters.types.has(i.type)) return false;
      if (filters.categories.size > 0 && !filters.categories.has(i.category)) return false;
      return true;
    });
  }

  bboxFromBounds(b: { west: number; south: number; east: number; north: number }): string {
    return `${b.west},${b.south},${b.east},${b.north}`;
  }

  parseBbox(bbox: string): { west: number; south: number; east: number; north: number } {
    const [w, s, e, n] = bbox.split(',').map(Number);
    return { west: w, south: s, east: e, north: n };
  }
}
