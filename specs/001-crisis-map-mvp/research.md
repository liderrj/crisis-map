# Phase 0 Research: CrisisMap MVP

**Feature**: 001-crisis-map-mvp | **Date**: 2026-06-27

This document records the technical decisions required to implement the spec
within the constitution's constraints. The constitution locks the stack
(Angular, Leaflet, AWS Lambda/API Gateway/DynamoDB/S3, CDK, Netlify hosting),
so there are no "NEEDS CLARIFICATION" stack unknowns. The research below
resolves the design-level choices that the spec and constitution leave open.

---

## 1. Geospatial queries on DynamoDB (bbox + 30 m duplicate detection)

**Decision**: Store a `geohash` (base32, precision 7) on every Incident.
Query the map viewport by computing the geohash cells covering the requested
`bbox` and using `begins_with(geohash, <cell>)` range queries per cell, then
filtering results to the exact lat/lng bounds server-side. For duplicate
detection, query the incident's cell plus its 8 neighbours and apply a
haversine filter for ≤ 30 m and matching `type`.

**Rationale**: DynamoDB has no native geo query. Geohash prefix queries are the
simplest pattern that needs no extra libraries (respecting the "no unnecessary
dependencies" rule). Precision 7 cells are ~153 m × 153 m, so a 30 m radius is
always within the 3×3 neighbour window; the haversine filter removes false
positives. For bbox queries, a handful of cells cover any reasonable viewport.

**Alternatives considered**:
- `dynamodb-geo` library — rejected: adds a heavy dependency and a hidden
  composite table layout that complicates the simple-table mandate.
- S2 geometry — rejected: more accurate but far more complex than needed for a
  community-scale MVP and harder to implement client-side.
- Scan + filter — rejected: violates the "never load all incidents" performance
  rule.

---

## 2. DynamoDB table design

**Decision**: Three separate simple tables (`Incidents`, `Confirmations`,
`Devices`) as named in the constitution, not a single-table design.

**Rationale**: The constitution explicitly requires "simple tables only" and
enumerates each table's attributes. A single-table (Uber) design would
contradict that mandate and hurt readability. Access patterns are simple enough
that a one-table-per-entity model with a couple of GSIs (below) suffices.

**Alternatives considered**:
- Single-table design — rejected: violates "simple tables only" and the
  explicit table list; optimisation not needed at MVP scale.

**Indexes needed**:
- `Incidents`: PK `incidentId`. GSI1 `geohash` (sort: `createdAt`) for bbox
  cell queries. GSI2 `type` (sort: `geohash`) for duplicate + filter queries.
- `Confirmations`: PK `incidentId`, SK `deviceId` — this enforces the
  "one action per device per incident" rule at the partition level (a second
  write to the same (incidentId, deviceId) is an overwrite or a conditional
  write failure).
- `Devices`: PK `deviceId`.

---

## 3. One-device-one-action enforcement (idempotency)

**Decision**: Enforce "a device can act on an incident at most once" with a
DynamoDB conditional write on the `Confirmations` table
(`PutItem` with a condition that the composite key does not already exist),
using `(incidentId, deviceId)` as PK+SK.

**Rationale**: This makes the rule a hard database constraint, not application
logic that races can break. A repeat submission returns a 409 Conflict, which
the client treats as already-done (no error shown to the user).

**Alternatives considered**:
- Check-then-insert in Lambda code — rejected: TOCTOU race under concurrent
  sync; two offline confirmations from the same device could both slip through.

---

## 4. Image upload strategy

**Decision**: Two-step upload. The client first creates the incident
(`POST /incidents`). After success, it requests one presigned S3 URL per image
via `POST /images` (or an `images` sub-resource), then `PUT`s the compressed
bytes directly to S3 over HTTPS. The `imageCount` on the incident is
incremented by the backend as uploads complete (or reconciled on read).

**Rationale**: Passing image bytes through Lambda doubles the cost and counts
against the 6 MB Lambda payload/timeout limits; presigned URLs let the browser
upload straight to S3, keeping Lambda tiny and cheap. This satisfies "upload
only after report creation" and "retry failed images later independently".

**Alternatives considered**:
- Proxy images through Lambda — rejected: cost, size limits, slower.
- Client uploads to S3 without backend coordination — rejected: no way to
  tie images to incidents or enforce the count/quota.

---

## 5. Client-side image compression

**Decision**: Compress in the browser with a `<canvas>` pipeline: load the
photo, scale longest side to ≤ 1280 px, encode as WebP at a quality that
yields ≤ 250 KB (step quality down until under budget, fallback to JPEG if
WebP unsupported). No server-side processing.

**Rationale**: The spec mandates client-side compression and ≤ 250 KB / 1280 px
before upload. Canvas is dependency-free and supported in all modern browsers.
WebP is preferred per the spec; JPEG is the safe fallback.

**Alternatives considered**:
- `sharp`/WASM libraries — rejected: extra dependency and weight for a job the
  native canvas already does.

---

## 6. Offline sync protocol

**Decision**: The client maintains an IndexedDB outbox of pending
`{type, payload}` operations (create-incident, confirm, upload-image). On sync
(app start, manual refresh, every 30 s while online) it sends the whole outbox
in one `POST` to a batch sync endpoint (or batches grouped by type) and removes
each op on success. Conflicts are resolved last-write-wins on counts; the
duplicate-prevention check runs server-side at apply time, returning either
"created" or "duplicate-of <incidentId>" so the client can reconcile.

**Rationale**: Constitution mandates batched sync (no one-request-per-report)
and offline operation. A single batch endpoint minimises round-trips. Running
duplicate detection at apply time (not just creation time) handles the
offline-duplicate case from the spec's edge cases.

**Alternatives considered**:
- One request per pending item — rejected: violates batch rule.
- Full CRDTs — rejected: overkill for counts and status; deterministic counts
  with idempotent confirmation keys are sufficient.

---

## 7. Confidence and expiration

**Decision**: `confidence = max(0, confirmations - negativeVotes)`, where
"confirm" and "improved" increment `confirmations`, "worsened" increments
`negativeVotes`, and "no longer exists" sets `status = resolved` (no count
change) — per the clarification session. Expiration is a 72 h sliding window:
every new confirmation resets `expiresAt = now + 72h`. Use DynamoDB TTL
(`expiresAt` epoch) to drive the "hide from default view" behaviour (TTL only
governs visibility/default-view filtering; items are not hard-deleted — TTL
deletion is acceptable since the constitution says "do not delete", so we
filter by `expiresAt`/`status` in queries rather than relying on TTL removal
for correctness).

**Rationale**: The clarification session fixed the action→count mapping and the
72 h sliding window. To honour "do not delete", default-view queries exclude
expired (`expiresAt < now`) and resolved items by filter, independent of
DynamoDB TTL. TTL can still be set as a long backstop for eventual cleanup of
truly stale rows.

**Alternatives considered**:
- Real TTL deletion for hiding — rejected: violates "do not delete" once
  scanned back into filters.

---

## 8. PWA / offline strategy

**Decision**: Angular service worker (built-in `@angular/service-worker`)
caches the app shell and static assets for offline launch. Map tiles are cached
at runtime (cache-first with network fallback) so previously viewed areas work
offline. Incident data is cached in IndexedDB. No data is required to render
the shell or reuse cached incidents.

**Rationale**: Must open directly to the map offline. App-shell precaching gives
instant load; runtime tile caching covers the viewed area. IndexedDB holds
incidents and the outbox.

**Alternatives considered**:
- Workbox standalone — rejected: Angular's SW is sufficient and avoids an extra
  dependency.

---

## 9. Marker clustering

**Decision**: `leaflet.markercluster` over plain Leaflet markers. Clusters
collapse when zoomed out and expand on zoom in.

**Rationale**: The spec explicitly requires clustering and the zoom behaviour.
`leaflet.markercluster` is the standard, small Leaflet plugin for this.

**Alternatives considered**: None needed; this is the canonical choice.

---

## 10. Device identity generation and storage

**Decision**: On first launch generate a UUID v4 (`crypto.randomUUID()`), store
it in IndexedDB (and `localStorage` as a fast mirror). The optional alias is
stored alongside it. Every API request includes `deviceId` and `alias`.

**Rationale**: Constitution mandates a local UUID, no accounts.
`crypto.randomUUID()` is native, dependency-free, and available in secure
contexts (HTTPS, which Netlify and API Gateway provide).

**Alternatives considered**:
- Cookie/session — rejected: violates the no-auth principle.

---

## Summary of all NEEDS CLARIFICATION

None. The Technical Context section of `plan.md` has no `NEEDS CLARIFICATION`
markers — the constitution and clarification session fully resolved the stack
and the key behaviour (severity scale, photo limit, confidence mapping,
expiration policy, "confirmed only" threshold, hosting split).
