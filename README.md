# CrisisMap

**CrisisMap** es una aplicación colaborativa de respuesta a desastres diseñada para ayudar a ciudadanos, voluntarios, organizaciones humanitarias y equipos de emergencia a recopilar y compartir información crítica durante terremotos, inundaciones y otras situaciones de crisis.

El proyecto está construido bajo un enfoque **offline-first**, permitiendo que cualquier persona pueda reportar incidentes como edificios colapsados, carreteras bloqueadas, personas atrapadas, hospitales, refugios, puntos de distribución de alimentos, agua o medicamentos y cortes de servicios básicos, incluso cuando no existe conexión a Internet. Cada reporte se almacena localmente en el dispositivo y se sincroniza automáticamente cuando la conectividad regresa, permitiendo que cada teléfono funcione como un nodo temporal de recolección de información durante las horas más críticas de una emergencia.

A diferencia de plataformas orientadas exclusivamente a organismos oficiales, **CrisisMap fue diseñado pensando primero en el ciudadano común**. La aplicación utiliza un lenguaje sencillo, categorías fáciles de entender y una interfaz intuitiva para que cualquier persona pueda colaborar sin necesidad de conocer protocolos técnicos o clasificaciones especializadas. La intención es reducir al máximo la barrera de participación para que la mayor cantidad posible de personas pueda aportar información útil. Posteriormente, esos reportes pueden ser revisados, validados, enriquecidos y utilizados por organizaciones humanitarias o autoridades mediante paneles de monitoreo y herramientas de análisis.

La aplicación fue desarrollada como una **Progressive Web App (PWA)** para facilitar su distribución y permitir una rápida adopción durante una emergencia. Basta con acceder a un enlace para instalarla, sin depender de Google Play o App Store, funcionando en Android, iPhone, Windows, Linux y cualquier dispositivo con un navegador moderno. Como parte de su funcionamiento, la aplicación descarga automáticamente la cartografía de la zona afectada para mantener el mapa disponible sin conexión, permitiendo consultar información, registrar nuevos incidentes y sincronizar los cambios cuando la conectividad se restablezca. Este enfoque busca minimizar las barreras de distribución y garantizar que la aplicación siga siendo útil incluso cuando la infraestructura de comunicaciones se encuentra degradada.

La visión del proyecto es construir una red distribuida de dispositivos capaces de recopilar información directamente desde el terreno y consolidarla progresivamente conforme la conectividad se restablece. En una etapa posterior, la información recopilada podrá alimentar paneles de monitoreo para autoridades y organizaciones humanitarias, donde los reportes ciudadanos se validen, se complementen con otras fuentes de información y apoyen la toma de decisiones, la priorización de recursos y la coordinación de la respuesta ante desastres.

Desde el punto de vista de ingeniería, CrisisMap fue desarrollado priorizando la **entrega rápida de valor**. Las decisiones de arquitectura y organización del código buscaron mantener una **arquitectura mínima viable**, suficientemente robusta para soportar la evolución del proyecto, pero evitando niveles de abstracción, patrones o complejidad que ralentizaran el desarrollo inicial. Algunas decisiones representan compromisos conscientes entre velocidad de implementación y mantenibilidad a largo plazo, entendiendo que, en un contexto de emergencia, disponer rápidamente de una herramienta funcional genera un impacto mayor que perseguir una arquitectura perfecta desde el primer día. La evolución natural del proyecto contempla incorporar progresivamente procesos de refactorización, paneles de administración, capacidades analíticas y enriquecimiento de datos conforme aumente su adopción y madurez. Este enfoque es consistente con prácticas ágiles que promueven una **Minimum Viable Architecture (MVA)**: una base arquitectónica lo suficientemente sólida para evolucionar sin caer en la sobreingeniería durante las primeras etapas del producto.

## Highlights

- **Offline-first** — cada reporte, confirmación y foto se escribe primero en IndexedDB y se sincroniza asíncronamente cuando la red regresa. Sin login, sin registro.
- **Mapa + Lista** — mapa Leaflet interactivo con clustering de marcadores y lista de distancia ordenada con scroll infinito (1 km, 5 km, 10 km, 25 km, 50 km o todos).
- **Fotos** — hasta tres por reporte, comprimidas en el navegador (WebP/JPEG), subidas a S3 mediante presigned URLs de vida corta y servidas a través de CloudFront CDN.
- **Geocodificación inversa** — cada incidente muestra su lat/lng y se abre en Google Maps o Waze para navegación.
- **Alias anónimos** — el usuario elige un alias corto al iniciar para que otros puedan identificar quién reportó qué.
- **i18n** — español, inglés y portugués.
- **Sin tracking, sin analíticas** — el único estado guardado sobre un usuario es su device UUID generado localmente y el alias elegido.

## Architecture

```
            ┌──────────────────────────┐
            │       Angular SPA        │     apps/web (static, deployable to
            │  (Leaflet + IndexedDB)   │     Netlify or any static host)
            └────────────┬─────────────┘
                         │ HTTPS (JSON + presigned S3 PUTs)
                         ▼
            ┌──────────────────────────┐
            │    API Gateway → Lambda  │     backend/lambdas
            │  POST /sync              │
            │  GET  /incidents         │
            │  POST /images            │
            │  GET  /images            │
            │  POST /seed              │
            │  GET  /legend            │
            └────────────┬─────────────┘
                         │
          ┌──────────────┼─────────────────┐
          ▼              ▼                 ▼
   ┌─────────────┐ ┌──────────────┐ ┌────────────────┐
   │ DynamoDB    │ │ S3 bucket    │ │ CloudFront CDN │
   │ Incidents   │ │ (images)     │ │ (read-only)    │
   │ (GSI on     │ │ Origin Access│ │                │
   │  category)  │ │ Control      │ │                │
   └─────────────┘ └──────────────┘ └────────────────┘
```

### Offline-first model

Cada acción del usuario es local-first:

| Acción                | Estado local                              | Payload de sincronización             |
|-----------------------|-------------------------------------------|---------------------------------------|
| Reportar incidente    | `incidents` table + outbox entry + map    | `create_incident` op (con lat/lng)    |
| Agregar fotos         | `pendingImages` table (Blob, comprimido)  | se envía tras sincronizar el reporte  |
| Confirmar incidente   | Outbox entry + incremento optimista       | `confirm` op                          |
| Cargar incidentes     | Cache table + ETag                        | `GET /incidents?bbox=…&etag=…`       |

El motor de sincronización corre en segundo plano con exponential backoff (30 s → 1 m → 5 m → 15 m, tope en 30 m), drena la cola de salida y envía las imágenes pendientes tras cada `create_incident` exitoso.

## Repository layout

```
.
├── apps/
│   └── web/                  Angular 21 standalone-component SPA
│       ├── src/app/
│       │   ├── banner/       Online + offline status banners
│       │   ├── contact/      Contact form
│       │   ├── core/         Storage, sync engine, network, i18n, API client,
│       │   │                 seed data, incident cache, device id
│       │   ├── filters/      Map category / type filters
│       │   ├── incident/     Incident list + detail modal
│       │   ├── legend/       Map legend
│       │   ├── map/          Leaflet map + controls + incident layer
│       │   ├── report/       Report form, image upload, duplicate prompt
│       │   ├── resources/    Third-party resource links
│       │   ├── shared/       Constants and shared types
│       │   └── terms/        Terms & privacy
│       ├── src/environments/ apiUrl + imageCdnUrl (prod / dev)
│       └── package.json
├── backend/
│   ├── cdk/                  AWS CDK stack (TypeScript)
│   ├── lambdas/              Lambda handlers (one folder per route)
│   │   ├── incidents/        create + list
│   │   ├── images/           upload presign + list
│   │   ├── seed/             bootstrap seed data
│   │   └── sync/             outbox drain endpoint
│   └── shared/               Shared types, geo utilities, DynamoDB client
├── specs/
│   └── 001-crisis-map-mvp/   Spec Kit artifacts (spec, plan, tasks, …)
├── .specify/                 Spec Kit toolchain config + scripts
├── .opencode/                OpenCode editor config (per-user)
├── package.json              npm workspaces root
└── README.md                 ← you are here
```

## Tech stack

| Layer        | Technology                                              |
|--------------|---------------------------------------------------------|
| Frontend     | Angular 21, standalone components, signals, IndexedDB   |
| Map          | Leaflet 1.9 + `leaflet.markercluster`                   |
| Tiles        | Self-hosted OSM raster tiles via S3 + CloudFront        |
| Compression  | Browser `<canvas>` → WebP / JPEG                       |
| i18n         | Custom lightweight in-memory dictionary (es / en / pt)  |
| Backend      | AWS Lambda (Node 20) + API Gateway (HTTP API)           |
| Database     | DynamoDB single-table design con category GSI           |
| Storage      | Two S3 buckets behind CloudFront (Origin Access Control) |
| IaC          | AWS CDK (TypeScript)                                    |
| Hosting      | Netlify (static SPA, free tier)                         |

## Local development

```bash
# Install dependencies for all workspaces
npm install

# Run the Angular dev server (http://localhost:4200)
npm run start

# Build for production
npm run build:web

# Regenerate PWA icons
node apps/web/scripts/generate-icons.js

# Backend: synthesize the CDK stack
npm run cdk:synth

# Backend: deploy (requires AWS credentials)
npm run cdk:deploy
```

> All AWS / CDK commands must use the `arkem` profile:
> `$env:AWS_PROFILE = "arkem"` (PowerShell) o `AWS_PROFILE=arkem` (bash).

## Configuration

Las variables de entorno públicas están en `apps/web/src/environments/environment.{development,production}.ts`:

```ts
export const environment = {
  production: true,
  apiUrl: 'https://<api-id>.execute-api.us-east-1.amazonaws.com',
  imageCdnUrl: 'https://<cloudfront-id>.cloudfront.net',
};
```

Son URLs públicas, no secretos, y es seguro commitearlas. **Nunca** pongas credenciales de AWS, JWT signing keys u otros secretos privados en el repositorio.

> **Modelo de seguridad**: CrisisMap no tiene autenticación. Cada request se atribuye a un `deviceId` (UUID v4) generado por el cliente. Cualquier persona puede enviar incidentes y confirmaciones desde cualquier deviceId. Esto es por diseño — identidad sin fricción — y significa que la API es inherentemente pública. Rate limiting (100 req/s por cuenta) y seed-token gating en `/seed` son los únicos controles de acceso.

## Deployment

### Backend (AWS CDK)

```bash
cd backend/cdk
npm install
npm run build
cdk bootstrap         # one-time per account/region
cdk deploy --profile arkem
```

### Frontend (Netlify)

El directorio `apps/web/dist/web` es un bundle estático listo para cualquier host estático. Para Netlify:

- Build command: `npm run build:web`
- Publish directory: `apps/web/dist/web`

## License

MIT — ver [LICENSE](./LICENSE).
