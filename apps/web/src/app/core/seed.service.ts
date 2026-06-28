import { Injectable, inject } from '@angular/core';
import { StorageService } from './storage.service';
import type { Incident } from '../shared/constants';

const SEED_FLAG_KEY = 'crisismap_seeded_v2';

const SEED_POINTS: Incident[] = [
  {
    incidentId: 'seed-huc-01', type: 'hospital', category: 'resource', severity: 'low', status: 'active',
    location: { lat: 10.502, lng: -66.913 }, description: 'Hospital Universitario de Caracas — referencia funcional',
    geohash: '', confirmations: 12, negativeVotes: 0, confidence: 12,
    creatorAlias: 'system', creatorDeviceId: 'system-seed',
    createdAt: Math.floor(Date.now() / 1000) - 86400, updatedAt: Math.floor(Date.now() / 1000) - 86400,
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30, imageCount: 0,
  },
  {
    incidentId: 'seed-hcc-01', type: 'hospital', category: 'resource', severity: 'low', status: 'active',
    location: { lat: 10.501, lng: -66.913 }, description: 'Hospital Clínico de Caracas — funcional',
    geohash: '', confirmations: 11, negativeVotes: 0, confidence: 11,
    creatorAlias: 'system', creatorDeviceId: 'system-seed',
    createdAt: Math.floor(Date.now() / 1000) - 86400, updatedAt: Math.floor(Date.now() / 1000) - 86400,
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30, imageCount: 0,
  },
  {
    incidentId: 'seed-hvargas-01', type: 'hospital', category: 'resource', severity: 'low', status: 'active',
    location: { lat: 10.505, lng: -66.925 }, description: 'Hospital Dr. José María Vargas — centro',
    geohash: '', confirmations: 8, negativeVotes: 0, confidence: 8,
    creatorAlias: 'system', creatorDeviceId: 'system-seed',
    createdAt: Math.floor(Date.now() / 1000) - 86400, updatedAt: Math.floor(Date.now() / 1000) - 86400,
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30, imageCount: 0,
  },
  {
    incidentId: 'seed-hperezleon-01', type: 'hospital', category: 'resource', severity: 'low', status: 'active',
    location: { lat: 10.487, lng: -66.815 }, description: 'Hospital Pérez de León (Petare) — funcional',
    geohash: '', confirmations: 7, negativeVotes: 0, confidence: 7,
    creatorAlias: 'system', creatorDeviceId: 'system-seed',
    createdAt: Math.floor(Date.now() / 1000) - 86400, updatedAt: Math.floor(Date.now() / 1000) - 86400,
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30, imageCount: 0,
  },
  {
    incidentId: 'seed-hsanatrix-01', type: 'hospital', category: 'resource', severity: 'low', status: 'active',
    location: { lat: 10.585, lng: -66.985 }, description: 'Clínica Sanatrix (cerca aeropuerto) — funcional',
    geohash: '', confirmations: 6, negativeVotes: 0, confidence: 6,
    creatorAlias: 'system', creatorDeviceId: 'system-seed',
    createdAt: Math.floor(Date.now() / 1000) - 86400, updatedAt: Math.floor(Date.now() / 1000) - 86400,
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30, imageCount: 0,
  },
  {
    incidentId: 'seed-elhatillo-01', type: 'shelter', category: 'resource', severity: 'low', status: 'active',
    location: { lat: 10.394, lng: -66.798 }, description: 'Refugio El Hatillo — zona alta, segura',
    geohash: '', confirmations: 14, negativeVotes: 0, confidence: 14,
    creatorAlias: 'system', creatorDeviceId: 'system-seed',
    createdAt: Math.floor(Date.now() / 1000) - 86400, updatedAt: Math.floor(Date.now() / 1000) - 86400,
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30, imageCount: 0,
  },
  {
    incidentId: 'seed-galipan-01', type: 'shelter', category: 'resource', severity: 'low', status: 'active',
    location: { lat: 10.541, lng: -66.880 }, description: 'Refugio Galipán — zona alta Ávila',
    geohash: '', confirmations: 10, negativeVotes: 0, confidence: 10,
    creatorAlias: 'system', creatorDeviceId: 'system-seed',
    createdAt: Math.floor(Date.now() / 1000) - 86400, updatedAt: Math.floor(Date.now() / 1000) - 86400,
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30, imageCount: 0,
  },
  {
    incidentId: 'seed-bellomonte-01', type: 'shelter', category: 'resource', severity: 'low', status: 'active',
    location: { lat: 10.485, lng: -66.880 }, description: 'Refugio Colinas de Bello Monte — zona alta oeste',
    geohash: '', confirmations: 9, negativeVotes: 0, confidence: 9,
    creatorAlias: 'system', creatorDeviceId: 'system-seed',
    createdAt: Math.floor(Date.now() / 1000) - 86400, updatedAt: Math.floor(Date.now() / 1000) - 86400,
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30, imageCount: 0,
  },
  {
    incidentId: 'seed-ccs-01', type: 'shelter', category: 'resource', severity: 'low', status: 'active',
    location: { lat: 10.603, lng: -66.991 }, description: 'Aeropuerto Simón Bolívar (CCS) — cerrado por daños',
    geohash: '', confirmations: 18, negativeVotes: 0, confidence: 18,
    creatorAlias: 'system', creatorDeviceId: 'system-seed',
    createdAt: Math.floor(Date.now() / 1000) - 86400, updatedAt: Math.floor(Date.now() / 1000) - 86400,
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30, imageCount: 0,
  },
  {
    incidentId: 'seed-plazafrancia-01', type: 'shelter', category: 'resource', severity: 'low', status: 'active',
    location: { lat: 10.490, lng: -66.836 }, description: 'Punto de encuentro Plaza Francia (Altamira)',
    geohash: '', confirmations: 9, negativeVotes: 0, confidence: 9,
    creatorAlias: 'system', creatorDeviceId: 'system-seed',
    createdAt: Math.floor(Date.now() / 1000) - 86400, updatedAt: Math.floor(Date.now() / 1000) - 86400,
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30, imageCount: 0,
  },
  {
    incidentId: 'seed-bomberos-01', type: 'shelter', category: 'resource', severity: 'low', status: 'active',
    location: { lat: 10.490, lng: -66.836 }, description: 'Estación de Bomberos Altamira',
    geohash: '', confirmations: 8, negativeVotes: 0, confidence: 8,
    creatorAlias: 'system', creatorDeviceId: 'system-seed',
    createdAt: Math.floor(Date.now() / 1000) - 86400, updatedAt: Math.floor(Date.now() / 1000) - 86400,
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30, imageCount: 0,
  },
  {
    incidentId: 'seed-aguairata-01', type: 'shelter', category: 'resource', severity: 'low', status: 'active',
    location: { lat: 10.572, lng: -66.880 }, description: 'Refugio La Guaira capital — operativo',
    geohash: '', confirmations: 10, negativeVotes: 0, confidence: 10,
    creatorAlias: 'system', creatorDeviceId: 'system-seed',
    createdAt: Math.floor(Date.now() / 1000) - 86400, updatedAt: Math.floor(Date.now() / 1000) - 86400,
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30, imageCount: 0,
  },
  {
    incidentId: 'seed-caraballeda-01', type: 'shelter', category: 'resource', severity: 'low', status: 'active',
    location: { lat: 10.613, lng: -66.851 }, description: 'Refugio Caraballeda — operativo',
    geohash: '', confirmations: 8, negativeVotes: 0, confidence: 8,
    creatorAlias: 'system', creatorDeviceId: 'system-seed',
    createdAt: Math.floor(Date.now() / 1000) - 86400, updatedAt: Math.floor(Date.now() / 1000) - 86400,
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30, imageCount: 0,
  },
  {
    incidentId: 'seed-catia-01', type: 'shelter', category: 'resource', severity: 'low', status: 'active',
    location: { lat: 10.604, lng: -67.030 }, description: 'Refugio Catia La Mar — operativo',
    geohash: '', confirmations: 8, negativeVotes: 0, confidence: 8,
    creatorAlias: 'system', creatorDeviceId: 'system-seed',
    createdAt: Math.floor(Date.now() / 1000) - 86400, updatedAt: Math.floor(Date.now() / 1000) - 86400,
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30, imageCount: 0,
  },
  {
    incidentId: 'seed-starlink-01', type: 'starlink', category: 'communications', severity: 'low', status: 'active',
    location: { lat: 10.490, lng: -66.836 }, description: 'WiFi satelital Starlink — Altamira (punto de conectividad)',
    geohash: '', confirmations: 11, negativeVotes: 0, confidence: 11,
    creatorAlias: 'system', creatorDeviceId: 'system-seed',
    createdAt: Math.floor(Date.now() / 1000) - 86400, updatedAt: Math.floor(Date.now() / 1000) - 86400,
    expiresAt: Math.floor(Date.now() / 1000) + 86400 * 30, imageCount: 0,
  },
];

@Injectable({ providedIn: 'root' })
export class SeedService {
  private storage = inject(StorageService);

  async seedIfNeeded(): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(SEED_FLAG_KEY)) return;

    try {
      await this.storage.cacheIncidents(SEED_POINTS);
      localStorage.setItem(SEED_FLAG_KEY, String(Date.now()));
      console.log('CrisisMap local seed loaded');
    } catch (err) {
      console.warn('CrisisMap seed error:', err);
    }
  }
}
