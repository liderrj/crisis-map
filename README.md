# CrisisMap

**CrisisMap** es una aplicación colaborativa de respuesta a desastres diseñada para ayudar a ciudadanos, voluntarios, organizaciones humanitarias y equipos de emergencia a recopilar y compartir información crítica durante terremotos, inundaciones y otras situaciones de crisis.

El proyecto está construido bajo un enfoque **offline-first**, permitiendo que cualquier persona pueda reportar incidentes como edificios colapsados, carreteras bloqueadas, personas atrapadas, hospitales, refugios, puntos de distribución de alimentos, agua o medicamentos y cortes de servicios básicos, incluso cuando no existe conexión a Internet. Cada reporte se almacena localmente en el dispositivo y se sincroniza automáticamente cuando la conectividad regresa, permitiendo que cada teléfono funcione como un nodo temporal de recolección de información durante las horas más críticas de una emergencia.

A diferencia de plataformas orientadas exclusivamente a organismos oficiales, **CrisisMap fue diseñado pensando primero en el ciudadano común**. La aplicación utiliza un lenguaje sencillo, categorías fáciles de entender y una interfaz intuitiva para que cualquier persona pueda colaborar sin necesidad de conocer protocolos técnicos o clasificaciones especializadas. La intención es reducir al máximo la barrera de participación para que la mayor cantidad posible de personas pueda aportar información útil. Posteriormente, esos reportes pueden ser revisados, validados, enriquecidos y utilizados por organizaciones humanitarias o autoridades mediante paneles de monitoreo y herramientas de análisis.

La aplicación fue desarrollada como una **Progressive Web App (PWA)** para facilitar su distribución y permitir una rápida adopción durante una emergencia. Basta con acceder a un enlace para instalarla, sin depender de Google Play o App Store, funcionando en Android, iPhone, Windows, Linux y cualquier dispositivo con un navegador moderno. Como parte de su funcionamiento, la aplicación descarga automáticamente la cartografía de la zona afectada para mantener el mapa disponible sin conexión, permitiendo consultar información, registrar nuevos incidentes y sincronizar los cambios cuando la conectividad se restablezca. Este enfoque busca minimizar las barreras de distribución y garantizar que la aplicación siga siendo útil incluso cuando la infraestructura de comunicaciones se encuentra degradada.

La visión del proyecto es construir una red distribuida de dispositivos capaces de recopilar información directamente desde el terreno y consolidarla progresivamente conforme la conectividad se restablece. En una etapa posterior, la información recopilada podrá alimentar paneles de monitoreo para autoridades y organizaciones humanitarias, donde los reportes ciudadanos se validen, se complementen con otras fuentes de información y apoyen la toma de decisiones, la priorización de recursos y la coordinación de la respuesta ante desastres.

Desde el punto de vista de ingeniería, CrisisMap fue desarrollado priorizando la **entrega rápida de valor**. Las decisiones de arquitectura y organización del código buscaron mantener una **arquitectura mínima viable**, suficientemente robusta para soportar la evolución del proyecto, pero evitando niveles de abstracción, patrones o complejidad que ralentizaran el desarrollo inicial. Algunas decisiones representan compromisos conscientes entre velocidad de implementación y mantenibilidad a largo plazo, entendiendo que, en un contexto de emergencia, disponer rápidamente de una herramienta funcional genera un impacto mayor que perseguir una arquitectura perfecta desde el primer día. La evolución natural del proyecto contempla incorporar progresivamente procesos de refactorización, paneles de administración, capacidades analíticas y enriquecimiento de datos conforme aumente su adopción y madurez. Este enfoque es consistente con prácticas ágiles que promueven una **Minimum Viable Architecture (MVA)**: una base arquitectónica lo suficientemente sólida para evolucionar sin caer en la sobreingeniería durante las primeras etapas del producto.

## Acceso

La aplicación está publicada y accesible en:

- **https://erqk-crisis-map.netlify.app/** — URL principal
- También puede referírsele como *ERQK Crisis Map*, *ERQK Mapa de Crisis* o simplemente *CrisisMap*.
- Código fuente: [github.com/liderrj/crisis-map](https://github.com/liderrj/crisis-map)

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

## Security

Los incidentes en el mapa son una señal de vida en una crisis. La
API ciudadana de confirmaciones aplica varias capas defensivas para
que ningún actor malicioso pueda hacer desaparecer incidentes ni
de-anonimizar a quien reporta:

- **Umbral para ocultar un incidente.** `POST /confirmations` con
  `action: "no_longer_exists"` requiere **≥3 votos afirmativos**
  (`confirm` / `improved` / `no_longer_exists`) de **≥2 deviceIds
  distintos** antes de transicionar el estado a `resolved`. Una sola
  petición ya no es suficiente.
- **deviceId nunca se devuelve.** El endpoint público expone
  `confirmerHash` (12 hex chars) derivado de
  `sha256(SECRET || incidentId || deviceId)`. El salt por-incidente
  garantiza que el mismo `deviceId` produzca un hash distinto en cada
  incidente: imposible correlacionar la actividad de un device
  cruzando incidentes.
- **Rate-limit por deviceId.** 5 POST /confirmations por minuto por
  deviceId (con fallback a IP si falta el header). Excedido devuelve
  429 con `Retry-After`. La tabla de contadores (`RateLimitsTable`)
  tiene TTL y falla-abierto si DDB está saturado.
- **Auditoría estructurada.** `CrisisMapConfirmationsAudit` (Log
  Group, 30 días de retención) recibe un JSON line por cada evento
  relevante: rate-limit hit, intento de ocultar por debajo del
  umbral, resolve exitoso. Admins pueden subscribirse vía metric
  filters o CloudWatch Insights.

Detalles y changelog completo en `CHANGELOG.md`.

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

---

## Partner API — Manual de uso paso a paso

Esta sección complementa la referencia rápida de arriba. Asume que
ya tienes un `client_id` y `client_secret` provistos por el
administrador (o que vas a usar `--sandbox` para auto-provisionarte
uno — ver final).

### 1. Obtén un Bearer token

```bash
curl -X POST https://y8mtov2nda.execute-api.us-east-1.amazonaws.com/v1/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET"
```

Respuesta (`200`):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiJ9.eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "incidents:read incidents:write"
}
```

Guarda `access_token`. Vence en 1 hora. Cuando recibas un `401` en
cualquier endpoint, repite este paso (los tokens no son refreshables,
solo client_credentials grant).

### 2. Crea un incidente (idempotente)

Recomendamos **siempre** enviar `externalId` — un identificador único
en tu sistema. Si reintentas el mismo POST (por timeout de red, etc.),
el servidor devuelve la fila existente con `idempotent: true` y no se
crea un duplicado.

```bash
TOKEN="eyJhbGciOi..."
curl -X POST https://y8mtov2nda.execute-api.us-east-1.amazonaws.com/v1/incidents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "ticket-12345",
    "type": "fire",
    "severity": "high",
    "location": { "lat": 10.50, "lng": -66.91 },
    "description": "Incendio reportado por bombero en turno",
    "imageUrls": ["https://partner.cdn/foto1.jpg"],
    "metadata": { "reporterName": "Cabo Pérez", "unit": "B-12" }
  }'
```

Respuesta (`201`):
```json
{
  "incidentId": "08b91fab-4028-48ac-b946-b1dd7158331c",
  "externalId": "ticket-12345",
  "status": "active",
  "createdAt": 1782753966,
  "isDemo": false,
  "images": [
    {
      "sourceUrl": "https://partner.cdn/foto1.jpg",
      "cdnUrl": "https://d5l3qvg3d9bnd.cloudfront.net/external/08b91fab.../0.jpg",
      "key": "external/08b91fab.../0.jpg",
      "contentType": "image/jpeg",
      "size": 184320
    }
  ]
}
```

Campos clave del body:
- `type` — uno de los 21 `IncidentType` (ver `/v1/openapi.json`).
- `severity` — `low`, `medium`, `high`.
- `location` — `{lat, lng}` con `lat ∈ [-90, 90]`, `lng ∈ [-180, 180]`.
- `imageUrls` — opcional, máx 3 URLs HTTPS públicas. El servidor las
  descarga, valida contra SSRF (rechaza IPs privadas / loopback / AWS
  metadata), y las rehostea en el CDN del proyecto. URLs `http://` o
  IPs literales son rechazadas por imagen con `code: "protocol_not_https"`
  o `"blocked_address"`. El incidente igual se crea con las imágenes
  exitosas; las fallidas se reportan individualmente en `images[]`.
- `metadata` — opcional, `Record<string, string|number|boolean>`.
- `reportedAt` — opcional, epoch seconds. Si se omite, se usa `now`.

`POST` puede devolver `200` con `idempotent: true` en lugar de `201`
si el `externalId` ya existe — eso es **normal**, no es un error.

### 3. Lista incidentes por viewport

```bash
curl "https://y8mtov2nda.execute-api.us-east-1.amazonaws.com/v1/incidents?\
bbox=-67.20,10.20,-66.40,10.80&type=fire,flood&severity=high&\
since=1719500000&limit=100" \
  -H "Authorization: Bearer $TOKEN"
```

Parámetros (todos opcionales excepto `bbox` o `source`):

| Param | Tipo | Notas |
|---|---|---|
| `bbox` | `minLng,minLat,maxLng,maxLat` | **Recomendado.** max 25 deg² (zoom continental). |
| `source` | `partner:<partnerId>` | Alternativa a `bbox` para listar todo de un partner. |
| `center` + `radius` | `lat,lng` + metros | Búsqueda radial. |
| `type` | CSV | ej. `fire,flood,hospital` |
| `category` | CSV | `emergency`, `infrastructure`, `service_interruption`, `resource`, `communications` |
| `severity` | CSV | `low`, `medium`, `high` |
| `status` | CSV | default `active`. Añade `resolved` para ver cerrados. |
| `since` | epoch sec | `createdAt >= since` |
| `until` | epoch sec | `createdAt <= until` |
| `minConfidence` | int | `confirmations - negativeVotes >= N` |
| `limit` | int 1-500 | default 100 |
| `sort` | enum | `createdAt` (default), `updatedAt`, `confidence` |
| `order` | enum | `desc` (default), `asc` |

### 4. Detalle de un incidente

```bash
curl "https://y8mtov2nda.execute-api.us-east-1.amazonaws.com/v1/incidents/$IID" \
  -H "Authorization: Bearer $TOKEN"
```

Incluye las confirmaciones embebidas y nunca expone `creatorDeviceId`
(PII). En sandbox, devuelve `404` para incidentes que no son tuyos.

### 5. Vota sobre un incidente

```bash
curl -X POST "https://y8mtov2nda.execute-api.us-east-1.amazonaws.com/v1/incidents/$IID/confirmations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "confirm",
    "voterId": "cabo-perez",
    "voterAlias": "Cabo Pérez"
  }'
```

- `action`: `confirm`, `improved`, `worsened`, `no_longer_exists`.
- `voterId`: tu identificador estable del votante (≤64 chars). El
  servidor lo namespacia como `partner:<partnerId>:<voterId>` para
  evitar colisiones entre partners. Dos votos del mismo `voterId`
  sobre el mismo incidente devuelven `409`.

### 6. Edita un incidente (solo tuyo)

```bash
curl -X PATCH "https://y8mtov2nda.execute-api.us-east-1.amazonaws.com/v1/incidents/$IID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "resolved",
    "description": "Atendido por bomberos a las 14:30",
    "metadata": { "resolution": "extinguished" }
  }'
```

Patchable: `severity`, `status`, `description`, `metadata`. Cualquier
otro campo es ignorado. Devuelve `403` si el incidente pertenece a
otro partner, o `404` si no existe / en sandbox no es tuyo.

### 7. Sandbox mode (recomendado para integraciones nuevas)

Si tu organización está explorando la API, pide al administrador que
te aprovisione un client con `--sandbox`. Mientras esté activo:

- Cada `POST /v1/incidents` se marca **automáticamente** como demo
  (`isDemo: true`). El incidente no aparece en el mapa de ciudadanos.
- `GET /v1/incidents` está filtrado a `source=partner:<tu-id>` — solo
  ves lo que tú has escrito.
- Detalle / votes / patch sobre incidentes ajenos devuelven `404`
  (no leak de existencia).
- No necesitas recordar el `externalId` para que un retry funcione;
  la idempotencia cubre el flujo completo.

Cuando termines las pruebas, el admin puede quitar el flag con:

```bash
node backend/scripts/provision-oauth-client.mjs set-sandbox \
  --client-id tu-client-id --sandbox false
```

### 8. Errores comunes

| HTTP | `code` | Causa probable | Solución |
|---|---|---|---|
| 400 | `bad_request` | Body mal formado, falta `type` o `location` | Validar JSON antes de enviar |
| 401 | `unauthorized` | Token ausente, expirado o con firma inválida | Pedir token nuevo en `/v1/oauth/token` |
| 403 | `insufficient_scope` | El token no tiene el scope necesario | Pedir token con `scope=incidents:read incidents:write` |
| 403 | `forbidden` | Intentas editar un incidente que no creaste | Filtrar por `source=partner:<id>` |
| 404 | `not_found` | El incidente no existe, o (en sandbox) no es tuyo | Verifica el ID |
| 409 | `already_verified` | El `voterId` ya votó sobre este incidente | Usa otro `voterId` o no reintentes |
| 500 | `internal_error` | Bug del servidor | Reportar al admin con el `RequestId` de CloudWatch |

### 9. Auto-provisionarte un client sandbox (admin only)

```bash
$env:AWS_PROFILE="arkem"
$env:OAUTH_CLIENTS_TABLE="CrisisMapStack-OAuthClientsTableOAuthClientsE7814F46-1038B61BLYTR0"

# Crea un client sandbox que puede escribir incidentes demo
node backend/scripts/provision-oauth-client.mjs create \
  --name "Mi App" \
  --partner-id mi-app \
  --scopes "incidents:read incidents:write" \
  --sandbox
```

La salida incluye `client_id` y `client_secret` (este último solo se
imprime una vez — guárdalo en tu secret manager). Para detalles de
los sub-comandos `rotate-secret`, `set-sandbox`, `disable`, `enable`,
ver `node backend/scripts/provision-oauth-client.mjs`.

### 10. Stack de referencia

| Componente | Valor |
|---|---|
| Base URL | `https://y8mtov2nda.execute-api.us-east-1.amazonaws.com` |
| OpenAPI spec | `GET /v1/openapi.json` (application/yaml) |
| Swagger UI | `GET /v1/docs` |
| TTL del token | 3600 s (1 h) |
| Límite de página | 500 (default 100) |
| Rate limit por client | 60 req/min (configurable al provisionar) |
| Retención audit log | 90 días |
| Rotación del JWT secret | `aws ssm put-parameter --name /crisismap/partner-api/jwt-signing-secret --type SecureString --value <new> --overwrite` — sin redeploy, máx 5 min para que todos los Lambda caches refresquen |

---

## Partner API (v1)

CrisisMap expone una API REST versionada para integraciones externas
(bomberos, ONGs, medios, otras plataformas de respuesta). Permite leer
y escribir incidentes usando OAuth2 client credentials. La PWA de
ciudadanos sigue usando sus endpoints sin auth en `/incidents`,
`/confirmations` y `/sync` (sin cambios).

- **Base URL**: `https://y8mtov2nda.execute-api.us-east-1.amazonaws.com`
- **Spec OpenAPI 3.1**: `GET /v1/openapi.json` (servido como `application/yaml`)
- **Swagger UI**: `GET /v1/docs` (CDN-hosted, sin auth)
- **Scopes disponibles**:
  - `incidents:read` — listar / obtener incidentes
  - `incidents:write` — crear / editar incidentes propios
  - `confirmations:read` — listar confirmaciones de un incidente
  - `confirmations:write` — votar sobre un incidente

### Endpoints

| Método | Path | Scope | Descripción |
|--------|------|-------|-------------|
| `POST` | `/v1/oauth/token` | (ninguno) | Intercambia `client_id` + `client_secret` por un JWT Bearer de 1h |
| `GET`  | `/v1/incidents` | `incidents:read` | Lista por `bbox` o `source=partner:<id>`, con filtros de tipo / severidad / fecha / radio |
| `GET`  | `/v1/incidents/{id}` | `incidents:read` | Detalle + confirmations embebidas |
| `POST` | `/v1/incidents` | `incidents:write` | Crear incidente (idempotente vía `externalId`); imágenes externas se descargan y rehostean en S3 |
| `PATCH`| `/v1/incidents/{id}` | `incidents:write` | Actualizar `severity`, `status`, `description`, `metadata` (solo del propio partner) |
| `GET`  | `/v1/incidents/{id}/confirmations` | `confirmations:read` | Listar voters |
| `POST` | `/v1/incidents/{id}/confirmations` | `confirmations:write` | Votar (`confirm` / `improved` / `worsened` / `no_longer_exists`) con `voterId` propio |

### Flujo OAuth2 (curl)

```bash
# 1. Pedir un token (form-encoded)
curl -X POST https://y8mtov2nda.execute-api.us-east-1.amazonaws.com/v1/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "scope=incidents:read incidents:write"

# 2. Usar el token en un endpoint protegido
TOKEN="eyJhbGciOi..."
curl https://y8mtov2nda.execute-api.us-east-1.amazonaws.com/v1/incidents?bbox=-67.20,10.20,-66.40,10.80 \
  -H "Authorization: Bearer $TOKEN"

# 3. Crear un incidente (idempotente vía externalId)
curl -X POST https://y8mtov2nda.execute-api.us-east-1.amazonaws.com/v1/incidents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "externalId": "ticket-12345",
    "type": "fire",
    "severity": "high",
    "location": { "lat": 10.50, "lng": -66.91 },
    "description": "Incendio reportado por bombero en turno",
    "imageUrls": ["https://partner.cdn/foto1.jpg"],
    "metadata": { "reporterName": "Cabo Pérez", "unit": "B-12" }
  }'
```

### Códigos de error comunes

- `400 bad_request` — payload inválido (filtro mal formado, tipo desconocido, etc.)
- `401 unauthorized` — token ausente, expirado, o con firma inválida
- `403 insufficient_scope` — el token no incluye el scope necesario
- `403 forbidden` — el partner intenta editar un incidente que no creó
- `404 not_found` — incidente inexistente
- `409 already_verified` — el voterId ya votó sobre este incidente

### Provisionar un cliente

```bash
$env:AWS_PROFILE="arkem"
$env:OAUTH_CLIENTS_TABLE="CrisisMapStack-OAuthClientsTableOAuthClients"

# Crear
node backend/scripts/provision-oauth-client.mjs create \
  --name "Bomberos Caracas" \
  --partner-id bomberos-caracas \
  --scopes "incidents:read incidents:write confirmations:read"

# Rotar el secret (imprime el nuevo secret una sola vez)
node backend/scripts/provision-oauth-client.mjs rotate-secret --client-id bomberos-caracas-XXXXXX

# Desactivar (conserva el audit trail pero rechaza los tokens)
node backend/scripts/provision-oauth-client.mjs disable --client-id bomberos-caracas-XXXXXX
```

El `client_secret` se imprime **una sola vez** en stdout. No se puede
recuperar de DynamoDB (se guarda hasheado con SHA-256). Si se pierde,
rota con `rotate-secret`.

### Seguridad y límites

- HTTPS obligatorio (forzado por API Gateway).
- JWT firmado con HS256 y secreto de 256+ bits cargado en deploy.
- Tokens expiran en 1h; no hay refresh — el cliente pide uno nuevo cuando lo necesita.
- Descarga de imágenes externas con protección SSRF (bloquea 127.0.0.0/8,
  10/8, 172.16/12, 192.168/16, 169.254/16, IPv6 ULA / link-local / loopback).
- Sin PII en respuestas a partners: nunca se devuelve `creatorDeviceId`
  (solo `creatorAlias`, que ya es público en el mapa).
- Audit log de todas las acciones de escritura en la tabla
  `ExternalActions` (TTL 90 días).
- Rate limit por partner: 60 req/min por defecto, configurable al crear
  el cliente.
