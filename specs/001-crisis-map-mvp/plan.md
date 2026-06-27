# Implementation Plan: CrisisMap MVP

**Branch**: `001-crisis-map-mvp` | **Date**: 2026-06-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-crisis-map-mvp/spec.md`

## Summary

CrisisMap is a mobile-first, offline-first PWA that lets citizens report and
verify disaster incidents and resources on a collaborative Leaflet map. The
frontend is an Angular PWA hosted on Netlify; the backend is a fully serverless
AWS stack (API Gateway HTTP API + Lambda + DynamoDB + S3 for images) provisioned
via AWS CDK. There is no authentication — a locally-generated `deviceId` is the
only identity. Reports are created and verified offline, queued in IndexedDB,
and synced in batches. Community confirmations drive a simple, deterministic
confidence score with no AI.

## Technical Context

**Language/Version**: TypeScript across the stack.
- Frontend: Angular (latest stable) + TypeScript.
- Backend: Node.js 20.x AWS Lambda runtime + TypeScript.
- Infrastructure: AWS CDK v2 (TypeScript).
- `backend/shared/` holds TypeScript types shared between Lambdas (and
  optionally generated for the frontend).

**Primary Dependencies**:
- Frontend: Angular, Leaflet, `leaflet.markercluster`, `idb` (minimal IndexedDB
  wrapper), Angular service worker (PWA/offline). No heavy UI libraries.
- Backend: AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`,
  `@aws-sdk/client-s3`), AWS Lambda handler runtime, sharp (or
  browser-equivalent on client) is NOT used server-side — image compression
  happens client-side only.
- Infrastructure: `aws-cdk-lib` v2, constructs. Deployed with
  `cdk deploy --profile arkem`.

**Storage**:
- DynamoDB: `Incidents`, `Confirmations`, `Devices` tables (single-table
  designs, details in `data-model.md`).
- S3: one bucket for user-uploaded images, served to clients via the backend
  API (presigned) or a CloudFront distribution over that bucket.
- Client: IndexedDB for the offline pending queue and cached incidents.

**Testing**:
- Frontend: Jasmine/Karma (unit), Playwright (e2e for the critical offline
  report → sync journey).
- Backend: Jest (Lambda handler unit/integration tests against a local
  DynamoDB via `@aws-sdk` + dynamodb-local or Jest mocks).
- CDK: `@aws-cdk/assert` snapshot tests for the stack.

**Target Platform**: Modern mobile and desktop web browsers; installable as a
PWA. Mobile-first, readable outdoors (high contrast, large tap targets).

**Project Type**: web-service (PWA frontend + serverless REST backend).

**Performance Goals**:
- Report form completable and submitted within 30 seconds of opening.
- Full first-use journey (open → see incidents → report → confirm) under 60
  seconds.
- Map loads only incidents within the current bounding box.
- Each image compressed client-side to ≤ 250 KB, longest side ≤ 1280 px.

**Constraints**:
- Offline-first: every feature (view/report/verify) works with no connection.
- No authentication, no email/phone; `deviceId` is the sole identity.
- Batched sync only; no one-request-per-report.
- No AI/ML; confidence is a deterministic formula.
- Serverless only; no long-running servers.
- Images uploaded only after their parent report is created.

**Scale/Scope**: MVP for community/city-scale disaster response. Serverless
scales on demand; no fixed concurrency target. Single-page app with one primary
screen (map) plus report form, filters, and legend.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Every plan MUST verify compliance with the principles in
`.specify/memory/constitution.md`. The following gates are mandatory for the
CrisisMap project:

- **I. Mobile-First & Offline-First** — does every user-facing feature work
  fully offline, and does the UI open directly to the map?
- **II. Zero-Friction Identity** — does the feature avoid login, email, phone,
  or any persistent account flow?
- **III. Serverless & Low-Cost Hosting** — does the backend fit the API
  Gateway / Lambda / DynamoDB model and deploy via `cdk deploy` (arkem
  profile), while the frontend ships to Netlify (not S3/CloudFront)?
- **IV. Community-Verified Truth, No AI** — does the feature avoid AI/ML and
  rely on confirmations, votes, or community input for truthfulness?
- **V. Performance & Bandwidth Discipline** — does the feature load only the
  map bounds, batch its requests, and keep payloads under the size budget?

Any violation MUST be recorded under "Complexity Tracking" with rationale.

**Gate evaluation (pre-research)**: all five gates PASS.

| Gate | Status | Evidence |
|------|--------|----------|
| I | PASS | IndexedDB queue + service worker; map is the launch screen; report/verify stored locally and synced later |
| II | PASS | UUID generated client-side, no accounts; `deviceId` only |
| III | PASS | Backend on Lambda/API Gateway/DynamoDB/S3 via CDK (`arkem`); frontend on Netlify |
| IV | PASS | Confidence = confirmations − negativeVotes; status transitions on "no longer exists"; no ML |
| V | PASS | bbox-scoped `GET /incidents`; batched sync; ≤250 KB/1280 px images; marker clustering |

## Project Structure

### Documentation (this feature)

```text
specs/001-crisis-map-mvp/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── api.md
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
apps/web/                       # Angular PWA frontend (hosted on Netlify)
├── src/
│   ├── app/
│   │   ├── core/               # device-id service, api client, sync engine
│   │   ├── map/                # Leaflet map + marker clustering
│   │   ├── report/             # report form (type, severity, photos)
│   │   ├── filters/            # filter chips
│   │   ├── legend/             # colour legend popup
│   │   ├── incident/           # incident detail / verify actions
│   │   └── shared/             # types, constants (incident types, colours)
│   ├── assets/
│   └── environments/
├── public/                     # PWA manifest, icons, service worker config
└── tests/                      # Karma unit tests, Playwright e2e

backend/
├── cdk/                        # AWS CDK v2 stack (TypeScript)
│   ├── lib/                    # stack constructs (api, tables, bucket, roles)
│   └── bin/                    # cdk entrypoint
├── lambdas/                    # Lambda handlers (Node 20, TypeScript)
│   ├── incidents/              # GET (bbox) + POST incidents, duplicate check
│   ├── confirmations/          # POST confirmations, one-per-device guard
│   ├── images/                 # POST images (presigned URL / direct upload)
│   ├── resources/              # GET /resources
│   ├── legend/                 # GET /legend (static taxonomy)
│   └── health/                 # GET /health
├── shared/                     # shared TS types across lambdas (Incident, etc.)
└── tests/                      # Jest unit + integration tests
```

**Structure Decision**: Monorepo as mandated by the constitution's Technical
Constraints. `apps/web` is the Angular PWA deployed to Netlify.
`backend/{cdk,lambdas,shared}` is the serverless AWS stack deployed via
`cdk deploy --profile arkem`. `backend/shared/` keeps TypeScript types common
to all Lambda handlers; the frontend has its own `shared/` under the app for
the same domain enums (incident types, colours).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. All five constitution gates pass.
