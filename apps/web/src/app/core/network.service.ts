import { Injectable, signal, NgZone } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NetworkService {
  readonly isOnline = signal(typeof navigator !== 'undefined' ? navigator.onLine : true);

  constructor(private zone: NgZone) {
    if (typeof window === 'undefined') return;

    const set = (value: boolean) => this.zone.run(() => this.isOnline.set(value));
    this.isOnline.set(navigator.onLine);

    window.addEventListener('online', () => set(true));
    window.addEventListener('offline', () => set(false));
  }
}
