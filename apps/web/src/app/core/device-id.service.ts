import { Injectable, signal } from '@angular/core';

const DEVICE_KEY = 'crisismap_device';

export interface DeviceRecord {
  deviceId: string;
  alias: string;
}

@Injectable({ providedIn: 'root' })
export class DeviceIdService {
  readonly device = signal<DeviceRecord>({ deviceId: '', alias: '' });

  constructor() {
    this.load();
  }

  private load(): void {
    const raw = localStorage.getItem(DEVICE_KEY);
    if (raw) {
      try {
        this.device.set(JSON.parse(raw));
        return;
      } catch {
        // fall through to generate
      }
    }
    const id = this.generateId();
    this.device.set({ deviceId: id, alias: '' });
    this.persist();
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  setAlias(alias: string): void {
    this.device.update((d) => ({ ...d, alias: alias.slice(0, 30) }));
    this.persist();
  }

  private persist(): void {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(this.device()));
  }
}
