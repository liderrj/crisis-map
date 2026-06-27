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

// Sub-bbox size the backend can answer under its 30s API Gateway timeout.
// Each sub-query takes ~1-3s; 4-9 tiles cover any reasonable viewport.
const MAX_BBOX_AREA = 0.04; // deg^2
const MAX_BBOX_SIDE = 0.20; // deg

@Injectable({ providedIn: 'root' })
export class IncidentLayerService {
  private api = inject(ApiClientService);
  private storage = inject(StorageService);

  async loadBbox(bbox: string, filters: FilterState): Promise<Incident[]> {
    const { west, south, east, north } = this.parseBbox(bbox);
    const tiles = this.tile(west, south, east, north);

    const results = await Promise.all(
      tiles.map(async (t) => {
        try {
          const inc = await this.api.getIncidents({
            bbox: this.bboxFromBounds(t),
            limit: 200,
            confirmedOnly: filters.confirmedOnly,
          });
          return inc;
        } catch {
          return [] as Incident[];
        }
      }),
    );

    const merged = new Map<string, Incident>();
    for (const arr of results) {
      for (const i of arr) {
        if (!merged.has(i.incidentId)) merged.set(i.incidentId, i);
      }
    }

    const filtered = this.applyFilters(Array.from(merged.values()), filters);
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

  parseBbox(bbox: string): { west: number; south: number; east: number; north: number } {
    const [w, s, e, n] = bbox.split(',').map(Number);
    return { west: w, south: s, east: e, north: n };
  }

  /**
   * Subdivide a bbox into smaller tiles if it exceeds the backend's
   * safe area. Each tile is at most MAX_BBOX_SIDE degrees per side
   * and MAX_BBOX_AREA total. A typical Caracas-area viewport ends up
   * in 1-2 tiles; a zoomed-out country view is at most 9 tiles.
   */
  private tile(west: number, south: number, east: number, north: number): { west: number; south: number; east: number; north: number }[] {
    const width = east - west;
    const height = north - south;
    if (width <= MAX_BBOX_SIDE && height <= MAX_BBOX_SIDE && width * height <= MAX_BBOX_AREA) {
      return [{ west, south, east, north }];
    }
    const cols = Math.max(1, Math.ceil(width / MAX_BBOX_SIDE));
    const rows = Math.max(1, Math.ceil(height / MAX_BBOX_SIDE));
    const tileW = width / cols;
    const tileH = height / rows;
    const tiles: { west: number; south: number; east: number; north: number }[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const w = west + c * tileW;
        const e = c === cols - 1 ? east : w + tileW;
        const s = south + r * tileH;
        const n = r === rows - 1 ? north : s + tileH;
        tiles.push({ west: w, south: s, east: e, north: n });
      }
    }
    return tiles;
  }
}