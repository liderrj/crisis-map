import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import type { Incident } from '../shared/constants';

const SEED_FLAG_KEY = 'crisismap_seeded_v1';

interface SeedPoint {
  type: Incident['type'];
  severity: Incident['severity'];
  location: { lat: number; lng: number };
  description: string;
  confirmations: number;
  alias: string;
  incidentId: string;
}

const SEED_POINTS: SeedPoint[] = [
  { incidentId: 'seed-huc-01', type: 'hospital', severity: 'low', location: { lat: 10.502, lng: -66.913 }, description: 'Hospital Universitario de Caracas — referencia funcional', confirmations: 12, alias: 'system' },
  { incidentId: 'seed-hcc-01', type: 'hospital', severity: 'low', location: { lat: 10.501, lng: -66.913 }, description: 'Hospital Clínico de Caracas — funcional', confirmations: 11, alias: 'system' },
  { incidentId: 'seed-hvargas-01', type: 'hospital', severity: 'low', location: { lat: 10.505, lng: -66.925 }, description: 'Hospital Dr. José María Vargas — centro', confirmations: 8, alias: 'system' },
  { incidentId: 'seed-hperezleon-01', type: 'hospital', severity: 'low', location: { lat: 10.487, lng: -66.815 }, description: 'Hospital Pérez de León (Petare) — funcional', confirmations: 7, alias: 'system' },
  { incidentId: 'seed-hsanatrix-01', type: 'hospital', severity: 'low', location: { lat: 10.585, lng: -66.985 }, description: 'Clínica Sanatrix (cerca aeropuerto) — funcional', confirmations: 6, alias: 'system' },
  { incidentId: 'seed-elhatillo-01', type: 'shelter', severity: 'low', location: { lat: 10.394, lng: -66.798 }, description: 'Refugio El Hatillo — zona alta, segura', confirmations: 14, alias: 'system' },
  { incidentId: 'seed-galipan-01', type: 'shelter', severity: 'low', location: { lat: 10.541, lng: -66.880 }, description: 'Refugio Galipán — zona alta Ávila', confirmations: 10, alias: 'system' },
  { incidentId: 'seed-bellomonte-01', type: 'shelter', severity: 'low', location: { lat: 10.485, lng: -66.880 }, description: 'Refugio Colinas de Bello Monte — zona alta oeste', confirmations: 9, alias: 'system' },
  { incidentId: 'seed-ccs-01', type: 'shelter', severity: 'low', location: { lat: 10.603, lng: -66.991 }, description: 'Aeropuerto Simón Bolívar (CCS) — cerrado por daños', confirmations: 18, alias: 'system' },
  { incidentId: 'seed-plazafrancia-01', type: 'shelter', severity: 'low', location: { lat: 10.490, lng: -66.836 }, description: 'Punto de encuentro Plaza Francia (Altamira)', confirmations: 9, alias: 'system' },
  { incidentId: 'seed-bomberos-01', type: 'shelter', severity: 'low', location: { lat: 10.490, lng: -66.836 }, description: 'Estación de Bomberos Altamira', confirmations: 8, alias: 'system' },
  { incidentId: 'seed-aguairata-01', type: 'shelter', severity: 'low', location: { lat: 10.572, lng: -66.880 }, description: 'Refugio La Guaira capital — operativo', confirmations: 10, alias: 'system' },
  { incidentId: 'seed-caraballeda-01', type: 'shelter', severity: 'low', location: { lat: 10.613, lng: -66.851 }, description: 'Refugio Caraballeda — operativo', confirmations: 8, alias: 'system' },
  { incidentId: 'seed-catia-01', type: 'shelter', severity: 'low', location: { lat: 10.604, lng: -67.030 }, description: 'Refugio Catia La Mar — operativo', confirmations: 8, alias: 'system' },
  { incidentId: 'seed-starlink-01', type: 'starlink', severity: 'low', location: { lat: 10.490, lng: -66.836 }, description: 'WiFi satelital Starlink — Altamira (punto de conectividad)', confirmations: 11, alias: 'system' },
];

@Injectable({ providedIn: 'root' })
export class SeedService {
  async seedIfNeeded(): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(SEED_FLAG_KEY)) return;

    try {
      const res = await fetch(`${environment.apiUrl}/seed`, {
        method: 'POST',
        headers: {
          'deviceId': 'system-seed',
          'X-Seed-Token': 'bba032c88a7c9cdbeb16d1388d4e9c9c1dd367bcf0945a7c99072ac44e28af16',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ incidents: SEED_POINTS }),
      });
      if (res.ok) {
        localStorage.setItem(SEED_FLAG_KEY, String(Date.now()));
        console.log('CrisisMap seed loaded');
      } else {
        console.warn('CrisisMap seed failed:', res.status);
      }
    } catch (err) {
      console.warn('CrisisMap seed error:', err);
    }
  }
}