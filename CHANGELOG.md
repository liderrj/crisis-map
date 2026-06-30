# Changelog

All notable changes to CrisisMap are documented here. The format is
loosely based on [Keep a Changelog](https://keepachangelog.com/) and
versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.1-security] - 2026-06-30

Security patch: see the v0.2.0 Partner API release for the
description of the features in this branch. The security fix is
applied on top of v0.2.0 and supersedes it; deploy v0.2.1-security
instead of v0.2.0.

### Security

This is a security release in response to a coordinated disclosure
from the Build4Venezuela team. The findings affect the citizen-facing
`/confirmations` endpoint and the integrity of incident data on the
public map.

#### Findings

- **[HIGH] Anyone could hide an incident with a single request.** A
  `POST /confirmations` with `action: "no_longer_exists"` flipped
  the incident's status to `resolved` on the first vote, with no
  threshold. Because `get-incidents` hides `resolved` rows by default,
  one curl request could make a life-safety incident disappear from
  the map. The only "identity" required was a `deviceId` UUID that
  the client can rotate trivially.
- **[MEDIUM] deviceId was exposed in public responses.** The
  `GET /confirmations` response included every confirmer's raw
  `deviceId`. Because the same `deviceId` is the only identity
  attached to reports and votes, exposing it allowed correlating a
  device's activity across incidents (de-anonymizing reporters in an
  anonymity-first app) and spoofing their votes.

#### Fix

- `POST /confirmations` with `no_longer_exists` no longer flips the
  status on the first vote. The incident is only marked `resolved`
  when both:
    - At least **3** affirming votes have accumulated
      (`confirm`, `improved`, or `no_longer_exists`; `worsened` does
      not affirm the incident exists), AND
    - At least **2 distinct deviceIds** have voted (worsened counts
      toward distinct devices; a single attacker cannot reach the
      threshold even rotating UUIDs).
  Below threshold, the response carries `resolved_pending: true` plus
  a `tally` object so clients can see how close they are. The flip
  uses an atomic `UpdateCommand` with `ConditionExpression:
  status = "active"` so concurrent resolves stay idempotent.
- `GET /confirmations` no longer returns `deviceId`. Each row now
  carries a `confirmerHash` (12 hex chars) derived from
  `sha256(SECRET || incidentId || deviceId)`. The per-incident salt
  means the same deviceId produces a different hash on every
  incident — no cross-incident correlation possible. The hash is
  stable within an incident so it still works as a list-key for the
  UI's `@for` track-by.
- Rate-limit POST `/confirmations` at **5 requests / minute /
  deviceId** via a new `RateLimitsTable` (TTL'd). Exceeding the cap
  returns 429 with a `Retry-After` header. The rate-limiter fails open
  on DDB outages so a metadata-table failure never breaks the main
  path.
- Every noteworthy confirmation event (rate-limit hit, threshold
  check failed, threshold reached) writes one structured JSON line to
  a dedicated CloudWatch Log Group `CrisisMapConfirmationsAudit`
  (30-day retention). Admins can subscribe to it via metric filters
  or query with CloudWatch Insights.
- The JWT signing secret in SSM is now reused as the per-incident
  salt for `confirmerHash`, so rotating it invalidates old hashes
  but keeps the system as one source of truth.

### Changed

- `backend/lambdas/confirmations/handler.ts` rewritten with the new
  threshold check, rate-limit call, audit log, and the new response
  shape (no `deviceId`, with `confirmerHash` and optional
  `resolved_pending` + `tally`).
- `apps/web/src/app/core/api-client.service.ts`: `Confirmer.deviceId`
  → `Confirmer.confirmerHash`.
- `apps/web/src/app/incident/incident-detail.component.ts`: track-by
  updated to use `confirmerHash`.

### Added

- `backend/shared/confirmation-threshold.ts`: `shouldResolve()`,
  `tallyVotes()`, `RESOLVE_THRESHOLD_CONFIRMATIONS = 3`,
  `RESOLVE_THRESHOLD_DISTINCT_DEVICES = 2`.
- `backend/shared/confirmer-hash.ts`: `computeConfirmerHash()` and
  `computeConfirmerHashAsync()` with secret loaded from SSM
  Parameter Store.
- `backend/shared/rate-limit.ts`: `checkAndIncrement()` with atomic
  fixed-window counter and TTL-based garbage collection.
- `backend/cdk/lib/rate-limits-table.ts`: new DynamoDB table with
  `expiresAt` TTL.
- `backend/cdk/lib/confirmations-audit-log.ts`: new CloudWatch Log
  Group dedicated to confirmation audit events.
- `backend/tests/shared/confirmation-threshold.test.ts`: 12 unit
  tests covering the threshold rules (`worsened` does not affirm;
  distinct-device count includes worsening; three worsening alone
  do not resolve; etc.).
- `backend/tests/shared/confirmer-hash.test.ts`: 5 unit tests
  covering the per-incident salt semantics (deterministic, no
  cross-incident correlation, secret rotation).

### Notes

- This release is **backward-incompatible** on the response shape of
  `GET /confirmations` for any caller that was reading `deviceId`.
  The field is replaced by `confirmerHash`. The citizen PWA was
  updated in this PR; partners using the API must adapt.
- Reports of incidents created before this fix that were
  inadvertently resolved by the vulnerable code path are NOT
  restored. They are presumed to be a small number; admins can
  re-resurrect them via the seed tooling if needed.
- The `RateLimitsTable` follows the project's existing PAY_PER_REQUEST
  + DESTROY-on-stack-delete pattern. No operational cost beyond the
  handful of requests per minute per active device.
- Audit log writes are best-effort: if CloudWatch Logs is
  unavailable, the failure is recorded in stderr but the request
  itself still succeeds.

## [0.2.0] - 2026-06-29 — Partner API v1

### Added
- **Partner API v1** (`/v1/*`) for external integrations. OAuth2
  client credentials grant with HS256 JWTs (1h TTL), four scopes
  (`incidents:read|write`, `confirmations:read|write`).
  - `POST /v1/oauth/token` — exchange `client_id` + `client_secret` for a Bearer token.
  - `GET /v1/incidents` — filter by `bbox`, `center`+`radius`, `type`,
    `category`, `severity`, `status`, `since`, `until`, `minConfidence`,
    `source`, `limit` (1-500, default 100), `sort`, `order`.
  - `GET /v1/incidents/{id}` — detail with embedded confirmations.
  - `POST /v1/incidents` — idempotent via `externalId` (composite GSI
    key). Rehosts external image URLs on the project's S3 bucket with
    SSRF protection (private/loopback/link-local IP blocks).
  - `PATCH /v1/incidents/{id}` — `severity`, `status`, `description`,
    `metadata`. Scoped to the partner that created the incident.
  - `GET /v1/incidents/{id}/confirmations` — list voters, optional date range.
  - `POST /v1/incidents/{id}/confirmations` — partner-side verification
    with a stable `voterId` per partner.
  - `GET /v1/openapi.json` (served as `application/yaml`) and
    `GET /v1/docs` (CDN-hosted Swagger UI).
- **SSM Parameter Store** for the JWT signing secret. The Lambda
  resolves the value via the SSM API at cold start, caches it in
  memory for 5 minutes, and `grantRead`s the SSM parameter. Rotating
  the secret (`aws ssm put-parameter --overwrite --type SecureString`)
  invalidates old tokens within 5 minutes without redeploying.
- **OAuth provisioning CLI** (`backend/scripts/provision-oauth-client.mjs`).
  `create` prints the secret once; `rotate-secret` issues a new
  secret; `disable` / `enable` toggle the row without losing the
  audit trail.
- **Audit log** (`ExternalActions` table, 90-day TTL) for every
  `POST`/`PATCH` from a partner, with `partnerId`, `incidentId`,
  `action`, and the request id.
- **OpenAPI 3.1 spec** (`backend/docs/openapi-v1.yaml`) hand-written
  with curl-friendly examples and constraint descriptions.
- **Unit tests** (jest + ts-jest) for the shared auth, JWT, and
  SSRF-safe-fetch modules. 18 tests, all passing.
- **SSRF protection** on the image rehost pipeline. Resolves the
  remote host and rejects any address in 10/8, 172.16/12, 192.168/16,
  127/8, 169.254/16, IPv6 ULA / link-local / loopback / unspecified,
  and the AWS metadata service. Streaming 5 MB body cap with
  content-length precheck.
- **CHANGELOG.md**, **README "Partner API" section** with curl examples.

### Changed
- **`CORS`**: allow `PATCH` and `Authorization` header on the API
  Gateway; `allowOrigins` now includes `*` in addition to the
  Netlify origin so server-to-server integrations work.
- **API Gateway routes**: added the typed `apigateway2.HttpMethod`
  helper so `PATCH` is a first-class route type.

### Security
- **JWT secret out of env-var storage**: previously the secret was
  passed as `JWT_SIGNING_SECRET` env-var, visible in the AWS console
  plaintext. Now it lives in SSM SecureString and is loaded via
  `ssm:GetParameter` at runtime.
- **PII redaction**: partner endpoints never return `creatorDeviceId`.
  The `creatorAlias` is kept (it was already public on the citizen
  map).
- **Idempotency on POST**: `externalId` is part of a composite GSI
  key (`${partnerId}#${externalId}`). Retries from the same partner
  return the original incident with `idempotent: true`, never
  duplicating rows.
- **Partner-scoped PATCH**: a partner can only edit incidents whose
  `partnerId` matches its own `partnerId` claim. Other partners
  receive 403.
- **Deterministic incidentId on POST**: `sha256(partnerId:externalId)`
  is shaped as a UUID v4 to satisfy the existing incidentId regex.
  Two concurrent retries with the same `externalId` race to the
  same row instead of producing duplicates.

### Notes
- The two DDB GSIs (`external-id-index` and `partner-source-index`)
  were created in two separate `cdk deploy` passes because DynamoDB
  only allows one new GSI per table update. The current
  `IncidentsTable` definition in `cdk/lib/incidents-table.ts`
  declares both. A future migration script can run a single
  backfill.
- The partner-side `voterId` is namespaced as
  `partner:<partnerId>:<voterId>` in the `Confirmations` table so
  it can never collide with a citizen's `deviceId`.
- The `@aws-sdk/client-ssm` module is included in the Node.js 20
  Lambda runtime; it is NOT shipped in the `dist/` artifact
  (the build script only copies the third-party packages that
  the runtime does not already provide: `jose` and `nodemailer`).

## [0.1.0] - 2026-06-27 — Initial MVA

The first cut of CrisisMap: offline-first PWA for citizen reporting
during a crisis, with a server-less backend on AWS Lambda + DynamoDB.
MVP closure tagged as `v0.1.0-mva`.

- Citizen-facing endpoints: `/incidents`, `/confirmations`, `/sync`,
  `/images`, `/seed`, `/devices/quota`, `/resources`, `/legend`,
  `/health`, `/contact` (Gmail SMTP for the contact form).
- Demo mode with a per-device 5-report lifetime cap.
- Tile cache (z=9-16 covering Caracas, La Guaira, Altamira).
- Image upload with WebP compression in the browser, presigned S3 PUT.
- Confirmation / cross-validation flow with per-device single vote.
- PWA with service worker, install prompt, version check + forced
  reload.
- i18n: es, en, pt.
- Contact form: Gmail SMTP via app password, hidden recipient email.
