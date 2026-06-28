# CrisisMap

A collaborative, **offline-first** emergency-mapping application focused on
Venezuela. Citizens report incidents (collapsed buildings, blocked roads,
hospitals, shelters, food/water/medicine, communications outages, …) directly
on a map. Reports work without internet connectivity and synchronize
automatically when the device comes back online.

The app is intentionally lightweight, mobile-friendly, and usable by people
with low digital literacy or under bandwidth-constrained conditions.

## Highlights

- **Offline-first** — every report, confirmation, and photo is written to
  IndexedDB first and synced asynchronously when the network returns.
  No login required, no registration.
- **Map + List views** — interactive Leaflet map with marker clustering and a
  distance-sorted infinite-scroll list (1 km, 5 km, 10 km, 25 km, 50 km,
  or all).
- **Photos** — up to three per report. Compressed in-browser (WebP/JPEG),
  uploaded to S3 via short-lived presigned URLs, and served through a
  CloudFront CDN.
- **Reverse geocoding + address pin** — every incident shows its lat/lng and
  opens in Google Maps or Waze for turn-by-turn navigation.
- **Anonymous aliases** — the user picks a short alias on first launch so
  other people can identify who reported what.
- **i18n** — Spanish, English, and Portuguese.
- **No tracking, no analytics** — the only state kept about a user is their
  locally-generated device UUID and chosen alias.

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

### Offline-first model (per the project constitution, §I)

Every user action is local-first:

| Action                | Local state                              | Sync payload                          |
|-----------------------|------------------------------------------|---------------------------------------|
| Submit a report       | `incidents` table + outbox entry + map   | `create_incident` op (with lat/lng)   |
| Add photos            | `pendingImages` table (Blob, compressed)  | flushed after parent report syncs     |
| Confirm a report      | Outbox entry + optimistic counter bump   | `confirm` op                          |
| Pull incidents in view| Cache table + ETag                       | `GET /incidents?bbox=…&etag=…`       |

The sync engine runs in the background, uses exponential backoff
(30 s → 1 m → 5 m → 15 m, capped at 30 m), drains the outbox, and
flushes pending images after each successful `create_incident`.

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
| Tiles        | Self-hosted OSM raster tiles via S3 + CloudFront — see [SELF_HOSTED_TILES.md](./apps/web/SELF_HOSTED_TILES.md) |
| Compression  | Browser `<canvas>` → WebP / JPEG                         |
| i18n         | Custom lightweight in-memory dictionary (es / en / pt)  |
| Backend      | AWS Lambda (Node 20) + API Gateway (HTTP API)          |
| Database     | DynamoDB single-table design with category GSI          |
| Storage      | Two S3 buckets behind CloudFront (Origin Access Control): incident images + map tiles |
| IaC          | AWS CDK (TypeScript)                                    |
| Hosting      | Netlify (static SPA, free tier)                         |

## Prerequisites

- Node.js ≥ 20
- npm ≥ 10 (workspaces enabled)
- AWS CLI v2 (only required for deploying the backend)
- An AWS account with permissions to create Lambda / API Gateway / DynamoDB /
  S3 / CloudFront resources

## Local development

```bash
# Install dependencies for all workspaces
npm install

# Run the Angular dev server (http://localhost:4200)
npm run start

# Build for production
npm run build:web

# Regenerate PWA icons (apps/web/public/icons/icon-192.png + icon-512.png)
node apps/web/scripts/generate-icons.js

# Backend: synthesize the CDK stack
npm run cdk:synth

# Backend: deploy (requires AWS credentials)
npm run cdk:deploy
```

> All AWS / CDK commands must use the `arkem` profile:
> `$env:AWS_PROFILE = "arkem"` (PowerShell) or
> `AWS_PROFILE=arkem` (bash).

## Configuration

Public environment variables live in
`apps/web/src/environments/environment.{development,production}.ts`:

```ts
export const environment = {
  production: true,
  apiUrl: 'https://<api-id>.execute-api.us-east-1.amazonaws.com',
  imageCdnUrl: 'https://<cloudfront-id>.cloudfront.net',
};
```

These are public URLs, not secrets, and are safe to commit. **Never** put AWS
credentials, JWT signing keys, or other private secrets in source control.
Anything sensitive should be supplied at deploy time via CI environment
variables or AWS Secrets Manager.

The backend uses a `SEED_TOKEN` environment variable (Lambda env) to gate the
seed endpoint; rotate it before exposing the API publicly.

## Deployment

### Backend (AWS CDK)

```bash
cd backend/cdk
npm install
npm run build
cdk bootstrap         # one-time per account/region
cdk deploy --profile arkem
```

The stack creates:

- API Gateway HTTP API (regional)
- Lambda functions for `/sync`, `/incidents`, `/images`, `/seed`, `/legend`
- DynamoDB table (`Incidents`) with a category GSI
- S3 bucket for images
- CloudFront distribution with Origin Access Control pointing at the bucket

### Frontend (Netlify)

The `apps/web/dist/web` directory is a static bundle ready for any static
host. For Netlify:

- Build command: `npm run build:web`
- Publish directory: `apps/web/dist/web`
- Set environment variables if you want a separate `apiUrl` /
  `imageCdnUrl` (otherwise the committed production values are used).

## Contributing

1. Fork / create a branch.
2. Read `.specify/memory/constitution.md` — the project constitution locks
   the stack (Angular + AWS serverless), the offline-first model, and the
   review workflow.
3. Follow the Spec Kit workflow (`specify → plan → tasks → implement`) for
   any non-trivial change.
4. Make sure `npm run build:web` and `npm run cdk:synth` both succeed before
   opening a PR.
5. No secrets in commits. Use `git diff --staged` and inspect every file.

## License

MIT — see [LICENSE](./LICENSE).
