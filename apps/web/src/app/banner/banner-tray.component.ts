import { Component } from '@angular/core';
import { OfflineBannerComponent } from './offline-banner.component';
import { QuakeBannerComponent } from './quake-banner.component';

@Component({
  selector: 'app-banner-tray',
  standalone: true,
  imports: [OfflineBannerComponent, QuakeBannerComponent],
  template: `
    <div class="cm-banner-tray">
      <app-offline-banner />
      <app-quake-banner />
    </div>
  `,
  styles: [`
    .cm-banner-tray {
      position: fixed;
      top: 0; left: 0; right: 0;
      z-index: 1099;
      display: flex;
      flex-direction: column;
    }
  `],
})
export class BannerTrayComponent {}
