export const environment = {
  production: true,
  apiUrl: 'https://y8mtov2nda.execute-api.us-east-1.amazonaws.com',
  imageCdnUrl: 'https://d5l3qvg3d9bnd.cloudfront.net',
  // Self-hosted OSM raster tiles (deployed via the TileStorage CDK
  // construct). Leaflet's tile layer reads this with the standard
  // {z}/{x}/{y} placeholders. The Service Worker caches requests to
  // this domain so the map works offline.
  tileUrl: 'https://d2x4k8j7a9s3.cloudfront.net/tiles/{z}/{x}/{y}.png',
};