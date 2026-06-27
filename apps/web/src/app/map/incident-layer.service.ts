import { Injectable, inject } from '@angular/core';
import { ApiClientService } from '../core/api-client.service';
import { StorageService } from '../core/storage.service';
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
  private nextToken: string | undefined;

  async loadBbox(bbox: string, filters: FilterState): Promise<Incident[]> {
    const incidents = await this.api.getIncidents({
      bbox,
      limit: 200,
      confirmedOnly: filters.confirmedOnly,
    });
    const filtered = this.applyFilters(incidents, filters);
    await this.storage.cacheIncidents(filtered);
    return filtered;
  }

  async getCached(): Promise<Incident[]> {
    return this.storage.getCachedIncidents();
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
}
