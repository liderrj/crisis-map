// Global Leaflet reference. The runtime Leaflet instance is loaded
// from unpkg.com in index.html (before the Angular bundle) so that
// leaflet.markercluster (also from CDN) can find `L` on the global
// scope. We avoid bundling two copies of Leaflet by referencing the
// global everywhere instead of `import * as L from 'leaflet'`.

import type * as Leaflet from 'leaflet';
import 'leaflet.markercluster';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace L {
    type LatLngTuple = Leaflet.LatLngTuple;
    type Map = Leaflet.Map;
    type Marker = Leaflet.Marker;
    type MarkerClusterGroup = Leaflet.MarkerClusterGroup;
    type TileLayer = Leaflet.TileLayer;
    type DivIcon = Leaflet.DivIcon;
    type LatLngBounds = Leaflet.LatLngBounds;
    type ImageOverlay = Leaflet.ImageOverlay;
    type LayerGroup = Leaflet.LayerGroup;
    type FitBoundsOptions = Leaflet.FitBoundsOptions;
    type Coords = Leaflet.Coords;
    type DoneCallback = Leaflet.DoneCallback;
  }

  // eslint-disable-next-line no-var
  var L: typeof Leaflet;
}

export {};
