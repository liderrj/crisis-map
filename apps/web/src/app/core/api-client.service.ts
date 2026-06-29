import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { DeviceIdService } from './device-id.service';
import { DemoModeService } from './demo-mode.service';
import type { Incident, IncidentType, Severity, ConfirmationAction, Location } from '../shared/constants';

export interface IncidentQuery {
  bbox?: string;
  type?: string;
  confirmedOnly?: boolean;
  includeHidden?: boolean;
  limit?: number;
  etag?: string;
}

export interface Confirmer {
  deviceId: string;
  alias: string;
  action: ConfirmationAction;
  createdAt: number;
}

export interface IncidentsResponse {
  incidents: Incident[];
  etag?: string;
  notModified?: boolean;
  rateLimited?: boolean;
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
  private demoMode = inject(DemoModeService);
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

  /** Append ?demo= query param based on the live demo mode flag. */
  private demoParam(): string {
    return this.demoMode.isDemo() ? 'demo=1' : 'demo=0';
  }

  async getDemoQuota(): Promise<{ deviceId: string; demoLimit: number; demoIncidentsCreated: number; remaining: number }> {
    try {
      const res = await fetch(`${this.base}/devices/quota`, { headers: this.headers(false) });
      if (!res.ok) return { deviceId: '', demoLimit: 5, demoIncidentsCreated: 0, remaining: 5 };
      return await res.json();
    } catch {
      return { deviceId: '', demoLimit: 5, demoIncidentsCreated: 0, remaining: 5 };
    }
  }

  async sendContact(payload: { subject: string; message: string; alias?: string; locale?: string }): Promise<boolean> {
    try {
      const res = await fetch(`${this.base}/contact`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(payload),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(`${this.base}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  async getIncidents(query: IncidentQuery): Promise<IncidentsResponse> {
    const params = new URLSearchParams();
    if (query.bbox) params.set('bbox', query.bbox);
    if (query.type) params.set('type', query.type);
    if (query.confirmedOnly) params.set('confirmedOnly', 'true');
    if (query.includeHidden) params.set('includeHidden', 'true');
    if (query.limit) params.set('limit', String(query.limit));
    params.set('demo', this.demoMode.isDemo() ? '1' : '0');

    const headers: Record<string, string> = {};
    if (query.etag) headers['If-None-Match'] = query.etag;

    const res = await fetch(`${this.base}/incidents?${params}`, { headers });

    if (res.status === 304) {
      return { incidents: [], notModified: true };
    }
    if (res.status === 429) {
      return { incidents: [], rateLimited: true };
    }
    const etag = res.headers.get('etag') ?? undefined;
    const data = await res.json();
    return { incidents: data.incidents ?? [], etag };
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

  private isValidUuid(id: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  }

  async listImages(incidentId: string): Promise<string[]> {
    if (!this.isValidUuid(incidentId)) return [];
    const res = await fetch(`${this.base}/images?incidentId=${encodeURIComponent(incidentId)}&${this.demoParam()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.keys) ? data.keys : [];
  }

  /**
   * Server-side confirmation metadata for an incident: alias, action,
   * and timestamp for every device that verified the report. Returns
   * an empty array on any failure (offline, no confirmations yet,
   * server error) so the detail UI can render gracefully.
   */
  async listConfirmations(incidentId: string): Promise<Confirmer[]> {
    if (!this.isValidUuid(incidentId)) return [];
    try {
      const res = await fetch(`${this.base}/confirmations?incidentId=${encodeURIComponent(incidentId)}&${this.demoParam()}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.confirmations) ? data.confirmations : [];
    } catch {
      return [];
    }
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
