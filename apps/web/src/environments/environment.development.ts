export const environment = {
  production: false,
  apiUrl: 'http://localhost:4200',
  imageCdnUrl: 'https://d5l3qvg3d9bnd.cloudfront.net',
  // Local dev falls back to the OSM tile servers. The Service Worker
  // is disabled in dev so the no-cors / CORS distinction doesn't
  // matter; once the user lands on the production deployment the
  // self-hosted CDN takes over.
  tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
};