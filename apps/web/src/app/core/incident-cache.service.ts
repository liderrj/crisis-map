import { Injectable, inject } from '@angular/core';
import { StorageService } from './storage.service';
import type { Incident } from '../shared/constants';

interface CachedTile {
  bbox: { west: number; south: number; east: number; north: number };
  incidents: Incident[];
  fetchedAt: number;
  etag?: string;
}

/** TTL for a tile: data older than this is discarded entirely. */
const TILE_TTL_MS = 72 * 60 * 60 * 1000;

/**
 * Data older than this is considered "stale" and will be refreshed in the
 * background on the next access. 30 min strikes a good balance for a
 * crisis map that is expected to work offline most of the time.
 */
const REFETCH_AFTER_MS = 30 * 60 * 1000;

const COOLDOWN_AFTER_429_MS = 2 * 60 * 1000;
const STORAGE_KEY_PREFIX = 'cm_tile_v1_';
const COOLDOWN_KEY = 'cm_cooldown_v1';

interface BboxKey {
  key: string;
  west: number; south: number; east: number; north: number;
}

function quantize(n: number, q: number): number {
  return Math.round(n / q) * q;
}

/**
 * Quantize a bbox to a ~0.01 deg grid so the cache is reusable across
 * small viewport pans.
 */
function tileKey(b: { west: number; south: number; east: number; north: number }): BboxKey {
  const q = 0.01;
  return {
    key: `${quantize(b.west, q).toFixed(3)}_${quantize(b.south, q).toFixed(3)}_${quantize(b.east, q).toFixed(3)}_${quantize(b.north, q).toFixed(3)}`,
    west: quantize(b.west, q),
    south: quantize(b.south, q),
    east: quantize(b.east, q),
    north: quantize(b.north, q),
  };
}

@Injectable({ providedIn: 'root' })
export class IncidentCacheService {
  private storage = inject(StorageService);

  async isCoolingDown(): Promise<boolean> {
    const until = Number(localStorage.getItem(COOLDOWN_KEY) ?? '0');
    return Date.now() < until;
  }

  async setCooldown(): Promise<void> {
    localStorage.setItem(COOLDOWN_KEY, String(Date.now() + COOLDOWN_AFTER_429_MS));
  }

  async read(bbox: { west: number; south: number; east: number; north: number }): Promise<{
    incidents: Incident[]; stale: boolean; found: boolean;
  }> {
    const key = STORAGE_KEY_PREFIX + tileKey(bbox).key;
    const raw = await this.storage.getKeyAsString(key);
    if (!raw) return { incidents: [], stale: true, found: false };
    try {
      const tile = JSON.parse(raw) as CachedTile;
      if (Date.now() - tile.fetchedAt > TILE_TTL_MS) return { incidents: [], stale: true, found: false };
      const stale = Date.now() - tile.fetchedAt > REFETCH_AFTER_MS;
      return { incidents: tile.incidents, stale, found: true };
    } catch {
      return { incidents: [], stale: true, found: false };
    }
  }

  async write(bbox: { west: number; south: number; east: number; north: number }, incidents: Incident[], etag?: string): Promise<void> {
    const tile: CachedTile = { bbox, incidents, fetchedAt: Date.now(), etag };
    const key = STORAGE_KEY_PREFIX + tileKey(bbox).key;
    await this.storage.setKeyAsString(key, JSON.stringify(tile));
  }

  async getEtag(bbox: { west: number; south: number; east: number; north: number }): Promise<string | undefined> {
    const key = STORAGE_KEY_PREFIX + tileKey(bbox).key;
    const raw = await this.storage.getKeyAsString(key);
    if (!raw) return undefined;
    try {
      const tile = JSON.parse(raw) as CachedTile;
      return tile.etag;
    } catch {
      return undefined;
    }
  }
}
