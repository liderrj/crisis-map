---

description: "Task list for CrisisMap MVP implementation"
---

# Tasks: CrisisMap MVP

**Input**: Design documents from `/specs/001-crisis-map-mvp/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested in the feature specification. Test tooling (Jest, Karma, Playwright) is configured during Setup, but dedicated test tasks are omitted. Add per-story tests later if a TDD approach is requested.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Frontend (Angular PWA)**: `apps/web/src/app/...`, deployed to Netlify
- **Backend (AWS serverless)**: `backend/cdk/`, `backend/lambdas/`, `backend/shared/`
- CDK deploys with the `arkem` AWS profile (`cdk deploy --profile arkem`)

## User Story Mapping

| Story | Priority | Title | Goal |
|-------|----------|-------|------|
| US1 | P1 | View Nearby Incidents on the Map | See map, markers, clusters, filters, legend |
| US2 | P1 | Report a New Incident | Create report ≤30s, photos, duplicate check |
| US3 | P2 | Verify and Update Existing Incidents | Confirm/vote, confidence, expiration |
| US4 | P2 | Use the App Fully Offline | Offline create/verify, batch sync on reconnect |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Initialize npm workspace monorepo with `apps/web` and `backend` packages in `package.json`
- [X] T002 Scaffold Angular PWA project with service worker in `apps/web` (Angular CLI `ng new --style=css --routing` + `@angular/service-worker`)
- [X] T003 [P] Initialize AWS CDK v2 TypeScript project in `backend/cdk/` (`bin/` entrypoint + `lib/` constructs)
- [X] T004 [P] Create Lambda handler package structure in `backend/lambdas/{incidents,confirmations,images,resources,legend,health,sync}/` with shared tsconfig
- [X] T005 [P] Create shared types package in `backend/shared/` (Incident, Confirmation, Device, enums)
- [X] T006 [P] Configure TypeScript, ESLint, and Prettier across workspaces in root `tsconfig.base.json`, `.eslintrc`, `.prettierrc`
- [X] T007 [P] Configure Jest for backend in `backend/jest.config.js` and Karma/Playwright for frontend in `apps/web/`
- [X] T008 [P] Create frontend shared constants for incident types, categories, colours, severities in `apps/web/src/app/shared/constants.ts`
- [X] T009 [P] Create backend shared constants mirroring incident types, categories, severities in `backend/shared/constants.ts`
- [X] T010 Configure frontend environments with `apiUrl` placeholder in `apps/web/src/environments/environment.ts` and `environment.development.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T011 Define DynamoDB `Incidents` table construct with PK `incidentId`, GSI1 (`geohash`,`createdAt`), GSI2 (`type`,`geohash`), TTL on `expiresAt` in `backend/cdk/lib/incidents-table.ts`
- [X] T012 [P] Define DynamoDB `Confirmations` table construct with PK `incidentId` + SK `deviceId` in `backend/cdk/lib/confirmations-table.ts`
- [X] T013 [P] Define DynamoDB `Devices` table construct with PK `deviceId` in `backend/cdk/lib/devices-table.ts`
- [X] T014 [P] Define S3 image bucket + CloudFront distribution (over the image bucket only) in `backend/cdk/lib/image-storage.ts`
- [X] T015 Define API Gateway HTTP API construct in `backend/cdk/lib/api.ts`
- [X] T016 Define IAM execution roles (least-privilege per Lambda) in `backend/cdk/lib/roles.ts`
- [X] T017 Compose root `CrisisMapStack` wiring tables, bucket, API, roles in `backend/cdk/lib/crisis-map-stack.ts`
- [X] T018 Configure CDK deploy entrypoint and `cdk.json` with `arkem` profile in `backend/cdk/bin/app.ts` and `backend/cdk/cdk.json`
- [X] T019 [P] Implement DynamoDB data-access helpers (get/put/query/begins_with) in `backend/shared/db.ts`
- [X] T020 [P] Implement geohash encode/decode + neighbour-cell helpers in `backend/shared/geo.ts`
- [X] T021 [P] Implement `deviceId` + `alias` request-header parsing/validation middleware in `backend/shared/headers.ts`
- [X] T022 Implement health Lambda handler returning `{status:"ok",time}` in `backend/lambdas/health/handler.ts` and wire `GET /health` route
- [X] T023 Implement device-id service (generate UUID via `crypto.randomUUID`, store in IndexedDB) in `apps/web/src/app/core/device-id.service.ts`
- [X] T024 Implement IndexedDB storage service (stores: `incidents`, `outbox`, `device`) in `apps/web/src/app/core/storage.service.ts`
- [X] T025 Implement API client service (base URL from environment, JSON, deviceId/alias headers) in `apps/web/src/app/core/api-client.service.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - View Nearby Incidents on the Map (Priority: P1) 🎯 MVP

**Goal**: Citizen opens app and immediately sees a map of nearby incidents with clusters, filters, and legend

**Independent Test**: Open app → map fills ~90% of screen centred on location → markers render within visible bbox → clusters expand on zoom → filters and legend work

### Implementation for User Story 1

- [X] T026 [P] [US1] Implement `GET /incidents` Lambda: bbox/geohash cell query, type/category/confirmedOnly filters, expiration+resolved default-view filtering, pagination in `backend/lambdas/incidents/get-incidents.ts`
- [X] T027 [P] [US1] Implement `GET /legend` Lambda returning colour→category mapping in `backend/lambdas/legend/handler.ts`
- [X] T028 [P] [US1] Implement `GET /resources` Lambda returning types/categories/severities in `backend/lambdas/resources/handler.ts`
- [X] T029 Wire `GET /incidents`, `GET /legend`, `GET /resources` routes to API Gateway in `backend/cdk/lib/api.ts`
- [X] T030 [P] [US1] Create Leaflet map component (full viewport ~90%, OpenStreetMap tiles) in `apps/web/src/app/map/map.component.ts`
- [X] T031 [US1] Configure marker clustering (`leaflet.markercluster`) with zoom expand behaviour in `apps/web/src/app/map/map.component.ts`
- [X] T032 [P] [US1] Create incident marker factory mapping type→category→colour in `apps/web/src/app/map/marker-style.ts`
- [X] T033 [US1] Implement bbox-scoped incident loading service (fetch on move/zoom, cache in IndexedDB) in `apps/web/src/app/map/incident-layer.service.ts`
- [X] T034 [P] [US1] Create filters component (Emergency, Infrastructure, Resources, Communications, Hospitals, Shelters, Confirmed only) in `apps/web/src/app/filters/filters.component.ts`
- [X] T035 [P] [US1] Create legend popup component (one-tap open/close) in `apps/web/src/app/legend/legend.component.ts`
- [X] T036 [US1] Create floating buttons (Report, My Location, Filters, Legend), no side menus in `apps/web/src/app/map/map-controls.component.ts`
- [X] T037 [US1] Implement My Location (centre map on GPS) in `apps/web/src/app/map/map-controls.component.ts`
- [X] T038 [US1] Set map as the launch route with no splash/onboarding in `apps/web/src/app/app.routes.ts` and `app.component.ts`

**Checkpoint**: User Story 1 fully functional — map shows nearby incidents independently testable

---

## Phase 4: User Story 2 - Report a New Incident (Priority: P1)

**Goal**: Citizen reports an incident in under 30 seconds with type, severity, optional photos; duplicate check at 30 m

**Independent Test**: Tap Report → form opens with GPS → select type/severity → submit ≤30s → incident appears on map → nearby duplicate of same type prompts confirm-or-create-new

### Implementation for User Story 2

- [X] T039 [P] [US2] Implement `POST /incidents` Lambda (validate type/severity/location, generate incidentId, init confirmations=1, set expiresAt, duplicate detection via geohash neighbours + haversine ≤30m) in `backend/lambdas/incidents/create-incident.ts`
- [X] T040 [P] [US2] Implement `POST /images` Lambda (validate count, `imageCount+count<=3`, issue presigned S3 PUT URLs) in `backend/lambdas/images/handler.ts`
- [X] T041 Wire `POST /incidents` and `POST /images` routes to API Gateway in `backend/cdk/lib/api.ts`
- [X] T042 [US2] Create report form component (GPS auto, type picker, severity Low/Medium/High, optional description ≤500 chars, photos) in `apps/web/src/app/report/report-form.component.ts`
- [X] T043 [US2] Implement client-side image compression (canvas, longest side ≤1280px, ≤250KB, WebP→JPEG fallback) in `apps/web/src/app/report/image-compress.ts`
- [X] T044 [US2] Implement image upload flow (request presigned URLs, PUT compressed bytes, independent retry on failure) in `apps/web/src/app/report/image-upload.service.ts`
- [X] T045 [US2] Implement duplicate prompt UI (confirm existing incident vs create new) in `apps/web/src/app/report/duplicate-prompt.component.ts`

**Checkpoint**: User Stories 1 AND 2 both work independently — full report→view loop

---

## Phase 5: User Story 3 - Verify and Update Existing Incidents (Priority: P2)

**Goal**: Citizens confirm/vote on incidents; confidence shown; resolved/expired hidden by default

**Independent Test**: Confirm an incident from device A → count rises; second confirm from same device rejected; "Confirmed by X people" shown; "no longer exists" hides it from default view

### Implementation for User Story 3

- [X] T046 [P] [US3] Implement `POST /confirmations` Lambda (conditional write on `(incidentId,deviceId)` → 409 on dup; apply side effects: confirm/improved→confirmations+1 & reset expiresAt, worsened→negativeVotes+1, no_longer_exists→status=resolved) in `backend/lambdas/confirmations/handler.ts`
- [X] T047 Wire `POST /confirmations` route to API Gateway in `backend/cdk/lib/api.ts`
- [X] T048 [P] [US3] Create incident detail/verify UI (confirm, situation improved, situation worsened, no longer exists) in `apps/web/src/app/incident/incident-detail.component.ts`
- [X] T049 [US3] Implement confidence display ("Confirmed by X people") in `apps/web/src/app/incident/incident-detail.component.ts`
- [X] T050 [US3] Implement "Confirmed only" filter (confirmations >= 2) wired into filters component in `apps/web/src/app/filters/filters.component.ts`

**Checkpoint**: User Stories 1, 2, AND 3 work independently — full report→view→verify loop

---

## Phase 6: User Story 4 - Use the App Fully Offline (Priority: P2)

**Goal**: Everything works without connectivity; pending items sync in batches on reconnect

**Independent Test**: Go offline → create report + verify → go online → items sync as one batch via `POST /sync` → no data loss; failed images retry independently

### Implementation for User Story 4

- [X] T051 [P] [US4] Implement `POST /sync` Lambda (batch apply ops: create_incident with at-apply-time duplicate detection, confirm with conditional write; return per-op results created/duplicate/applied/conflict/error) in `backend/lambdas/sync/handler.ts`
- [X] T052 Wire `POST /sync` route to API Gateway in `backend/cdk/lib/api.ts`
- [X] T053 [US4] Implement outbox sync engine (drain IndexedDB outbox on app start, manual refresh, and every 30s online; remove ops on success; batch via `POST /sync`) in `apps/web/src/app/core/sync-engine.service.ts`
- [X] T054 [US4] Implement offline-aware incident/report creation (queue to outbox, show own pending reports on map) in `apps/web/src/app/report/report-form.component.ts` and `apps/web/src/app/map/incident-layer.service.ts`
- [X] T055 [US4] Configure Angular service worker for app-shell precache + runtime map-tile caching in `apps/web/ngsw-config.json` and `angular.json`
- [X] T056 [US4] Handle sync result reconciliation (apply duplicate/applied/conflict responses, update local incidents) in `apps/web/src/app/core/sync-engine.service.ts`

**Checkpoint**: All four user stories independently functional — full offline-first MVP

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T057 [P] Configure Netlify deploy (build command `npm run build`, publish dir `apps/web/dist/<app>`) in `netlify.toml`
- [X] T058 [P] Add PWA manifest + icons in `apps/web/public/manifest.webmanifest` and `apps/web/public/icons/`
- [X] T059 [P] Apply outdoor-readable styling (high contrast, large tap targets, no decorative graphics) in `apps/web/src/styles.css`
- [X] T060 [P] Implement frontend pagination (nextToken cursor) on bbox incident loading in `apps/web/src/app/map/incident-layer.service.ts`
- [X] T061 [P] Wire CDK output API URL into frontend environment on deploy in `backend/cdk/lib/crisis-map-stack.ts` and deploy script
- [X] T062 Run quickstart.md full-stack verification (open→map, report≤30s, confirm from 2nd device, offline→sync, bbox-only, image≤250KB) per `specs/001-crisis-map-mvp/quickstart.md`
- [X] T063 Run PWA/Lighthouse audit (installable, offline-capable) and fix gaps

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Starts after Foundational; no dependency on other stories
- **US2 (P1)**: Starts after Foundational; benefits from US1 map for display but independently testable
- **US3 (P2)**: Starts after Foundational; needs incidents to exist (US1/US2 data) for full testing but code is independent
- **US4 (P2)**: Starts after Foundational; wraps US2/US3 creation flows for offline queuing

### Within Each User Story

- Backend Lambdas before API Gateway route wiring
- Services before components that consume them
- Core implementation before UI integration

### Parallel Opportunities

- Setup tasks marked [P] can run in parallel (different packages)
- Foundational tasks marked [P] can run in parallel (different construct/model files)
- Within a story, all [P] backend Lambdas and all [P] frontend components can run in parallel
- Backend Lambdas and frontend components within the same story can be developed in parallel by different people

---

## Parallel Example: User Story 1

```text
# Launch all backend Lambdas for US1 together:
Task: "GET /incidents Lambda in backend/lambdas/incidents/get-incidents.ts"
Task: "GET /legend Lambda in backend/lambdas/legend/handler.ts"
Task: "GET /resources Lambda in backend/lambdas/resources/handler.ts"

# Launch independent frontend components for US1 together:
Task: "filters component in apps/web/src/app/filters/filters.component.ts"
Task: "legend popup component in apps/web/src/app/legend/legend.component.ts"
Task: "marker factory in apps/web/src/app/map/marker-style.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (view incidents on map)
4. **STOP and VALIDATE**: Open app → see nearby incidents independently
5. Deploy backend (`cdk deploy --profile arkem`) + frontend (Netlify) if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Test → Deploy/Demo (MVP!)
3. Add US2 → Test → Deploy/Demo (reporting works)
4. Add US3 → Test → Deploy/Demo (community verification)
5. Add US4 → Test → Deploy/Demo (full offline-first MVP)
6. Polish phase → final hardening

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- All AWS/CDK commands use the `arkem` profile
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently
- Tests are optional (tooling configured in Setup); add TDD tasks if requested
