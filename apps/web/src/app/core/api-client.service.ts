import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { DeviceIdService } from './device-id.service';
import type { Incident, IncidentType, Severity, ConfirmationAction, Location } from '../shared/constants';

export interface IncidentQuery {
  bbox?: string;
  type?: string;
  confirmedOnly?: boolean;
  includeHidden?: boolean;
  limit?: number;
}

export interface IncidentCreate {
  type: IncidentType;
  severity: Severity;
  location: Location;
  description?: string;
  imageCount: number;
}

export interface CreateResult {
  incidentId?: string;
  duplicateOf?: string;
  message?: string;
}

export interface UploadUrl {
  index: number;
  url: string;
  key: string;
  method: string;
}

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  private device = inject(DeviceIdService);
  private readonly base = environment.apiUrl;

  private headers(json = true): Record<string, string> {
    const h: Record<string, string> = {
      deviceId: this.device.device().deviceId,
    };
    const alias = this.device.device().alias;
    if (alias) h['alias'] = alias;
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.base}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async getIncidents(query: IncidentQuery): Promise<Incident[]> {
    const params = new URLSearchParams();
    if (query.bbox) params.set('bbox', query.bbox);
    if (query.type) params.set('type', query.type);
    if (query.confirmedOnly) params.set('confirmedOnly', 'true');
    if (query.includeHidden) params.set('includeHidden', 'true');
    if (query.limit) params.set('limit', String(query.limit));

    const res = await fetch(`${this.base}/incidents?${params}`);
    const data = await res.json();
    return data.incidents ?? [];
  }

  async createIncident(input: IncidentCreate): Promise<CreateResult> {
    const res = await fetch(`${this.base}/incidents`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(input),
    });
    return res.json();
  }

  async confirm(incidentId: string, action: ConfirmationAction): Promise<unknown> {
    const res = await fetch(`${this.base}/confirmations`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ incidentId, action }),
    });
    return res.json();
  }

  async requestUploadUrls(incidentId: string, count: number): Promise<UploadUrl[]> {
    const res = await fetch(`${this.base}/images`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ incidentId, count }),
    });
    const data = await res.json();
    return data.uploads ?? [];
  }

  async uploadImage(url: string, blob: Blob): Promise<boolean> {
    const res = await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/webp' } });
    return res.ok;
  }

  async getLegend(): Promise<{ colour: string; label: string }[]> {
    const res = await fetch(`${this.base}/legend`);
    const data = await res.json();
    return data.legend ?? [];
  }

  async sync(operations: { op: string; payload: unknown }[]): Promise<unknown> {
    const res = await fetch(`${this.base}/sync`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ operations }),
    });
    return res.json();
  }
}
