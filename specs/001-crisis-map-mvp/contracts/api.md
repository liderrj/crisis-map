# API Contract: CrisisMap MVP

**Feature**: 001-crisis-map-mvp | **Date**: 2026-06-27

REST API (JSON only) served by AWS Lambda behind an API Gateway HTTP API. No
authentication. Every mutating request MUST carry a `deviceId` header (and an
optional `alias` header). All responses are JSON; all timestamps are epoch
seconds (UTC).

## Shared headers

| Header | Required | Description |
|--------|----------|-------------|
| `deviceId` | On all POSTs | UUID v4 generated client-side on first launch. |
| `alias` | Optional on POSTs | Display alias to store/echo; may be omitted or empty. |

## Shared error envelope

```json
{ "error": "human-readable message", "code": "machine_code" }
```

Common status codes: `200 OK`, `201 Created`, `204 No Content`, `400 Bad
Request`, `409 Conflict` (duplicate action / duplicate device), `500 Internal
Server Error`.

---

## 1. GET /health

Liveness probe. No auth, no headers.

**Response** `200`:
```json
{ "status": "ok", "time": 1719500000 }
```

---

## 2. GET /incidents

Returns incidents in the current map viewport. At least one of `bbox` or
`geohash` MUST be supplied; the server MUST NEVER return the full dataset.

**Query params**

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `bbox` | string `minLng,minLat,maxLng,maxLat` | yes* | map bounds. |
| `geohash` | string | yes* | alternative to bbox. |
| `type` | string | no | filter by IncidentType (repeatable). |
| `category` | string | no | filter by IncidentCategory (repeatable). |
| `confirmedOnly` | boolean | no | if true, `confirmations >= 2`. |
| `includeHidden` | boolean | no | include resolved/expired (default false). |
| `limit` | integer | no | page size (default 100, max 200). |
| `nextToken` | string | no | pagination cursor. |

\* Exactly one of `bbox` / `geohash` required.

**Response** `200`:
```json
{
  "incidents": [
    {
      "incidentId": "uuid",
      "type": "fire",
      "category": "emergency",
      "severity": "high",
      "status": "active",
      "location": { "lat": 12.34, "lng": -1.23 },
      "geohash": "ecx1k2z",
      "description": "...",
      "createdAt": 1719500000,
      "updatedAt": 1719500100,
      "creatorAlias": "someone",
      "confirmations": 3,
      "negativeVotes": 0,
      "confidence": 3,
      "imageCount": 2,
      "expiresAt": 1719759200
    }
  ],
  "nextToken": "cursor-or-omitted"
}
```

**Errors**: `400` if neither bbox nor geohash supplied.

---

## 3. POST /incidents

Create a new incident. Headers `deviceId` required. Triggers server-side
duplicate detection (same type within 30 m).

**Request body**:
```json
{
  "type": "fire",
  "severity": "high",
  "location": { "lat": 12.34, "lng": -1.23 },
  "description": "optional text",
  "imageCount": 2
}
```

**Response** `201`:
```json
{
  "incidentId": "uuid",
  "status": "active",
  "confirmations": 1,
  "negativeVotes": 0,
  "createdAt": 1719500000,
  "expiresAt": 1719759200
}
```

**Duplicate response** `200` (when an identical-type incident exists within
30 m), telling the client to confirm instead:
```json
{
  "duplicateOf": "existing-incidentId",
  "message": "A similar incident exists nearby."
}
```
The client then asks the user to confirm the existing one or force-create new.

**Errors**: `400` invalid type/severity/location; `409` forced duplicate create
rejected.

---

## 4. POST /confirmations

Record a device's verification action. Enforces one action per
(incident, device). Headers `deviceId` required.

**Request body**:
```json
{ "incidentId": "uuid", "action": "confirm" }
```

**Response** `200`:
```json
{
  "incidentId": "uuid",
  "confirmations": 4,
  "negativeVotes": 0,
  "confidence": 4,
  "status": "active",
  "expiresAt": 1719760000
}
```

**Errors**: `409` if this device already acted on the incident; `400` invalid
action; `404` incident not found.

---

## 5. POST /images

Request presigned S3 upload URLs for an incident's images. Called only AFTER
the incident is created. Headers `deviceId` required.

**Request body**:
```json
{ "incidentId": "uuid", "count": 2 }
```

**Response** `200`:
```json
{
  "incidentId": "uuid",
  "uploads": [
    { "index": 0, "url": "https://s3.../presigned", "method": "PUT" },
    { "index": 1, "url": "https://s3.../presigned", "method": "PUT" }
  ]
}
```

The client then `PUT`s each compressed image (≤ 250 KB, ≤ 1280 px, WebP) to the
returned URL. Failed uploads retry independently and do not block the incident.

**Errors**: `400` count out of range or `imageCount + count > 3`; `404`
incident not found.

---

## 6. GET /resources

Returns static resource/reference data the client needs (incident types with
category + colour, filters, severity levels). Equivalent in content to legend
but structured for app consumption.

**Response** `200`:
```json
{
  "types": [
    { "type": "fire", "category": "emergency", "colour": "red" }
  ],
  "severities": ["low", "medium", "high"],
  "categories": [
    { "category": "emergency", "colour": "red", "label": "Emergency" }
  ]
}
```

---

## 7. GET /legend

Human-readable legend (colour → category meaning). Intended for the Legend
popup. Static payload.

**Response** `200`:
```json
{
  "legend": [
    { "colour": "red",    "label": "Emergency" },
    { "colour": "orange", "label": "Infrastructure damage" },
    { "colour": "yellow", "label": "Service interruption" },
    { "colour": "green",  "label": "Available resource" },
    { "colour": "blue",   "label": "Communications" }
  ]
}
```

---

## 8. POST /sync

Batch endpoint that drains the offline outbox in one request. Satisfies the
"never send one request per report" rule. Headers `deviceId` required.

**Request body** (array of pending operations):
```json
{
  "operations": [
    { "op": "create_incident", "payload": { "type": "fire", "severity": "high", "location": {"lat":12.34,"lng":-1.23}, "description": "...", "imageCount": 1 } },
    { "op": "confirm", "payload": { "incidentId": "uuid", "action": "confirm" } }
  ]
}
```

**Response** `200` (per-op result, same order):
```json
{
  "results": [
    { "op": "create_incident", "status": "created", "incidentId": "uuid" },
    { "op": "create_incident", "status": "duplicate", "duplicateOf": "uuid" },
    { "op": "confirm", "status": "applied", "incidentId": "uuid", "confirmations": 4 },
    { "op": "confirm", "status": "conflict", "message": "already verified by this device" }
  ]
}
```

Each result status: `created`, `duplicate`, `applied`, `conflict`, `error`. The
client removes successfully-processed ops from the outbox and retries the rest.

**Notes**
- Image uploads are NOT part of `/sync`; they use `POST /images` + presigned
  PUTs after the incident is created (operationally separate so a failed image
  never blocks the report).
- This endpoint is an addition to the constitution's explicit endpoint list,
  required to honour the batched-sync rule (Principle V).

---

## Rate limiting / throttling

API Gateway throttles per-route. Defaults are acceptable for MVP; tighten if
abuse appears. No per-device quota is needed for the MVP (deviceId is
pseudonymous and not authenticated).
