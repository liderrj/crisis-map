# Feature Specification: CrisisMap MVP

**Feature Branch**: `001-crisis-map-mvp`

**Created**: 2026-06-27

**Status**: Draft

**Input**: User description: "Build a lightweight disaster response Progressive Web App (PWA) that allows citizens to report incidents and available resources on a collaborative map. Works with intermittent connectivity, requires almost no administration, lowest possible infrastructure cost. A collaborative incident map — not a social network, not a chat, not a rescue coordination platform."

## Clarifications

### Session 2026-06-27

- Q: How do the four verification actions map to confidence and incident status? → A: "confirm" and "situation improved" each count as a confirmation; "situation worsened" counts as a negative vote; "no longer exists" sets the incident status to "resolved" (a lifecycle event, not a vote).
- Q: How long is the expiration window and do confirmations extend it? → A: Each new confirmation resets the incident's expiration to a 72-hour window; expiration is dynamic, not fixed at creation.
- Q: What severity scale does the report form use? → A: A 3-level scale: Low / Medium / High.
- Q: What is the maximum number of photos per report? → A: 3 photos per report.
- Q: What does the "Confirmed only" filter mean given every incident starts with 1 confirmation? → A: "Confirmed only" shows incidents confirmed by at least one OTHER person (total confirmations ≥ 2).
- Decision (user-provided): Frontend hosting will use Netlify (pay-as-you-go, simple to scale) instead of S3 + CloudFront. The backend (API, Lambda, DynamoDB, image storage) remains on AWS. NOTE: constitution Principle III was amended to v1.2.0 on 2026-06-27 to reflect this split (frontend → Netlify, backend+images → AWS CDK).

## User Scenarios & Testing *(mandatory)*

<!--
  User stories are ordered by priority. Each is independently testable:
  implementing any single one still yields a viable MVP slice.
-->

### User Story 1 - View Nearby Incidents on the Map (Priority: P1)

A citizen opens the app and immediately sees a map centred on their location
showing nearby incidents and available resources as coloured markers. When
many markers overlap, they collapse into clusters that expand as the user
zooms in. The citizen can filter what is shown and open a legend to understand
marker colours, all without leaving the map.

**Why this priority**: Seeing the situation around you is the single most
valuable action and the reason the app exists. Every other story depends on
the map existing and being populated.

**Independent Test**: Can be fully tested by opening the app (even against
seeded or other users' data) and confirming the map loads to the user's
location, markers render within the visible area only, clusters expand on
zoom, and filters and legend work.

**Acceptance Scenarios**:

1. **Given** the app is installed and location permission granted, **When** the
   citizen opens it, **Then** a map fills roughly 90% of the screen, centred on
   the user's current location, with no splash screen or onboarding step in the
   way.
2. **Given** multiple incidents exist close together, **When** the citizen zooms
   out, **Then** those incidents collapse into a single cluster marker, and
   **When** the citizen zooms in, **Then** the cluster expands into individual
   markers.
3. **Given** incidents of various types exist, **When** the citizen applies a
   filter (e.g. "Emergency only"), **Then** only matching markers remain
   visible and all others are hidden.
4. **Given** the citizen wants to understand marker colours, **When** they tap
   the Legend button, **Then** a simple popup explains each colour category and
   closes with a single tap.
5. **Given** the citizen pans or zooms the map, **When** the visible area
   changes, **Then** only incidents inside the current visible bounds are
   loaded and displayed — never the entire dataset.

---

### User Story 2 - Report a New Incident (Priority: P1)

A citizen witnesses an incident or resource and reports it in under 30 seconds.
They pick a type, set a severity, optionally add a short description and up to a
few photos, and submit. If a very similar incident already exists nearby, the
app asks whether to confirm the existing one or create a new report. The report
is accepted immediately, even with no connection.

**Why this priority**: Without fresh reports from citizens the map goes stale;
capturing reports is the engine that feeds the entire system.

**Independent Test**: Can be tested by creating a report with a type, severity,
and optional photo, submitting it, and confirming it appears on the map and
that a nearby-duplicate prompt appears when an identical-type incident exists
within 30 metres.

**Acceptance Scenarios**:

1. **Given** the citizen is on the map, **When** they tap the Report button,
   **Then** a report form opens pre-filled with their current GPS location.
2. **Given** the report form is open, **When** the citizen selects a type,
   sets a severity, optionally adds a description and photos, and submits,
   **Then** the report is accepted and the citizen returns to the map within
   30 seconds of opening the form.
3. **Given** an incident of the same type already exists within 30 metres of
   the citizen's location, **When** the citizen starts a new report of that
   type, **Then** the app asks them to either confirm the existing incident or
   still create a new report.
4. **Given** the citizen added photos, **Then** each photo is compressed to a
   maximum of 250 KB with its longest side at most 1280 pixels before being
   stored or sent.
5. **Given** the citizen has no connection, **When** they submit a report,
   **Then** it is stored locally and flagged as pending, and the map shows
   their own pending report immediately.

---

### User Story 3 - Verify and Update Existing Incidents (Priority: P2)

A citizen near an existing incident can confirm it or indicate that the
situation has improved, worsened, or no longer exists. Each device can only
act once per incident. The system computes a simple, transparent confidence
value and surfaces it as "Confirmed by X people" so others can judge
trustworthiness. Incidents that receive no confirmations past their expiration
are hidden from the default view but never deleted.

**Why this priority**: Community verification is what keeps a registration-free,
admin-free system trustworthy. It is the mechanism that replaces moderation.

**Independent Test**: Can be tested by confirming an incident from one device,
attempting to confirm it again from the same device (blocked), confirming from
additional devices, and verifying the displayed confirmation count and any
hide-on-expiration behaviour.

**Acceptance Scenarios**:

1. **Given** the citizen is viewing an existing incident, **When** they choose
   to confirm it, **Then** the incident's confirmation count increases and the
   incident displays "Confirmed by X people".
2. **Given** a device has already confirmed or voted on an incident, **When**
   it attempts to act on that same incident again, **Then** the action is
   rejected and the citizen is informed they have already verified it.
3. **Given** a citizen observes a change, **When** they mark the situation as
   "improved", "worsened", or "no longer exists", **Then** that feedback is
   recorded against the incident: "improved" adds a confirmation, "worsened"
   adds a negative vote, and "no longer exists" sets the incident to
   "resolved" status (hidden from the default view but stored).
4. **Given** an incident has been marked "no longer exists", **When** the
   default map view loads, **Then** that resolved incident is hidden but
   remains stored and can be surfaced through explicit filters if needed.
5. **Given** an incident has received no confirmations past its expiration,
   **When** the default map view loads, **Then** that incident is hidden but
   remains stored and can still be surfaced through explicit filters if needed.
6. **Given** multiple confirmations and negative votes exist, **Then** the
   displayed confidence reflects a simple, transparent calculation
   (confirmations minus negative votes) with no automated or AI-driven
   ranking.

---

### User Story 4 - Use the App Fully Offline (Priority: P2)

A citizen in an area with no connectivity can still view previously loaded
incidents, create new reports, and verify existing ones. Everything they do
offline is queued locally and synchronised automatically once connectivity
returns, using batched transfers to keep bandwidth use minimal.

**Why this priority**: Disasters routinely destroy connectivity; if the app
stops working without a signal it fails its core purpose.

**Independent Test**: Can be tested by disabling the network, performing report
creation and verification actions, re-enabling the network, and confirming the
queued actions sync as a single batch with no data loss.

**Acceptance Scenarios**:

1. **Given** the device has no connectivity, **When** the citizen opens the
   app, **Then** the map and any previously loaded incidents remain usable and
   new reports and verifications can be created and stored locally.
2. **Given** actions were created while offline, **When** connectivity returns,
   **Then** all pending reports and verifications are synchronised
   automatically without requiring the citizen to retry each one.
3. **Given** pending actions exist, **When** synchronisation runs, **Then**
   reports and verifications are sent as batched requests rather than one
   request per item.
4. **Given** the app is online, **When** it starts up, the citizen manually
   refreshes, or 30 seconds have elapsed, **Then** synchronisation runs.
5. **Given** a photo failed to upload, **Then** it is retried later without
   blocking the sync of its parent report or other pending items.

---

### Edge Cases

- What happens when location permission is denied or GPS is unavailable? The
  app must let the citizen set a position manually on the map or default to the
  last known/visible area rather than blocking report creation.
- What happens when the device clock is wrong or offline for a long time?
  Timestamps must be reconciled on sync so incident ordering and expiration
  remain meaningful.
- What happens when a pending report's location duplicates an incident created
  by someone else while offline? The duplicate-prevention prompt must run at
  sync time, not only at creation time.
- What happens when storage is full and IndexedDB cannot accept new pending
  items? The app must warn the citizen and preserve the most recent reports.
- What happens when the visible map area is extremely large (e.g. zoomed out to
  a whole country)? The system must avoid attempting to load a huge number of
  incidents, returning clusters or a safe maximum instead.
- What happens when a citizen changes their alias? Past reports must continue
  to display under the alias that was active when they were created (or update
  uniformly — a documented assumption, see below).

## Requirements *(mandatory)*

### Functional Requirements

**Identity & Access**

- **FR-001**: The system MUST NOT require login, email, phone number, or any
  form of registration.
- **FR-002**: On first launch the app MUST generate a unique device identifier,
  store it locally, and reuse it on every subsequent launch.
- **FR-003**: The app MUST ask the citizen, optionally, for an alias at first
  launch and MUST allow the alias to be changed at any time.
- **FR-004**: The app MUST open directly to the map with no splash screen and
  no onboarding flow.

**Map & Viewing**

- **FR-005**: The map MUST occupy approximately 90% of the screen with floating
  buttons for Report, My Location, Filters, and Legend, and no side menus.
- **FR-006**: The system MUST display only incidents within the current visible
  map area and MUST NEVER load or render the full incident dataset at once.
- **FR-007**: The system MUST group overlapping markers into clusters when
  zoomed out and expand them into individual markers as the citizen zooms in.
- **FR-008**: The app MUST provide filters covering at least Emergency,
  Infrastructure, Resources, Communications, Hospitals, Shelters, and
  "Confirmed only". The "Confirmed only" filter MUST show only incidents with
  2 or more total confirmations (i.e. confirmed by at least one person other
  than the reporter).
- **FR-009**: The app MUST provide a one-tap legend popup that explains the
  marker colour categories and closes with a single tap.
- **FR-010**: Markers MUST use a fixed colour taxonomy: Red = Emergency,
  Orange = Infrastructure damage, Yellow = Service interruption,
  Green = Available resource, Blue = Communications.

**Reporting**

- **FR-011**: The report form MUST capture GPS location (automatically), type,
  severity (Low / Medium / High), an optional description, and optional photos
  — and nothing else.
- **FR-011a**: Severity MUST be a 3-level scale: Low, Medium, High.
- **FR-012**: The citizen MUST be able to complete and submit a report within
  30 seconds of opening the form.
- **FR-013**: Incident types MUST be limited to the closed set: People trapped,
  Building collapse, Damaged building, Fire, Flood, Road blocked, Bridge
  damaged, Landslide, Hospital, Shelter, Food, Water, Medicine, Electricity,
  Fuel, Internet, Starlink, Open WiFi, Charging Point, Other.
- **FR-014**: When a new report of a given type is started within 30 metres of
  an existing incident of the same type, the app MUST ask the citizen to either
  confirm the existing incident or create a new report.
- **FR-015**: Photos MUST be compressed before upload to a maximum of 250 KB
  with the longest side at most 1280 pixels, in a modern web image format. A
  report MUST accept at most 3 photos.

**Community Verification**

- **FR-016**: Every new incident MUST start with exactly one confirmation
  (the reporter's implicit confirmation).
- **FR-017**: A device MUST be able to act on a given incident at most once.
- **FR-018**: A citizen MUST be able to mark an incident as: confirm, situation
  improved, situation worsened, or no longer exists.
- **FR-019**: The system MUST compute confidence as a simple, transparent
  function of confirmations and negative votes, with no AI or automated
  ranking. Specifically: "confirm" and "situation improved" each increment the
  confirmation count; "situation worsened" increments the negative-vote count;
  "no longer exists" does not affect confidence and instead sets the incident
  status to "resolved".
- **FR-019a**: An incident's status MUST transition to "resolved" when any
  citizen marks it "no longer exists". Resolved incidents MUST be hidden from
  the default view (like expired incidents) but MUST remain stored.
- **FR-020**: The system MUST display incident trustworthiness in human terms
  such as "Confirmed by X people".

**Offline & Synchronisation**

- **FR-021**: Every feature (viewing, reporting, verifying) MUST work fully
  without an internet connection.
- **FR-022**: Reports and verifications created offline MUST be stored locally
  in a pending queue.
- **FR-023**: Pending items MUST synchronise automatically when connectivity
  returns, without per-item manual retry.
- **FR-024**: Synchronisation MUST use batched transfers and MUST NOT send one
  request per item.
- **FR-025**: Synchronisation MUST trigger on app start, on manual refresh, and
  automatically every 30 seconds while online.

**Lifecycle & Performance**

- **FR-026**: Every incident MUST have an expiration of 72 hours. Each new
  confirmation MUST reset the expiration to a fresh 72-hour window from the
  time of that confirmation. Incidents whose expiration passes with no
  confirming activity MUST be hidden from the default view but MUST NOT be
  deleted.
- **FR-027**: All transferred data MUST be kept as small as practicable:
  payloads compressed, results paginated, and only the current map bounds
  requested.
- **FR-028**: Failed image uploads MUST be retried later without blocking the
  sync of their parent report or other pending items.

**Scope Boundaries**

- **FR-029**: The system MUST NOT include social features, chat, direct
  messaging, or rescue coordination workflows. It is only a collaborative
  incident map.
- **FR-030**: The system MUST NOT provide any administrator role or manual
  moderation tooling; the community keeps information current through
  verification alone.

### Key Entities *(include if feature involves data)*

- **Incident**: A single report on the map. Described by its geographic
  location, type (from the closed list), severity (Low / Medium / High),
  free-text description,
  current status (at least "active" and "resolved"), the alias of whoever
  created it, a count of confirmations, a count of negative votes, the number
  of attached images, and creation/update timestamps. Each incident carries
  its own expiration; each confirmation resets the expiration to a 72-hour
  window. Status transitions to "resolved" when marked "no longer exists".
- **Confirmation**: A single verification action taken by one device against
  one incident — "confirm", "situation improved", "situation worsened", or
  "no longer exists" — with a timestamp. A device may contribute at most one
  confirmation per incident.
- **Device**: The local identity of a citizen's installation: its generated
  unique identifier, optional alias, and creation timestamp. The device is the
  only identity primitive; there are no accounts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Any citizen can open the app, see nearby incidents, report a new
  incident, confirm an existing one, and continue using the app offline — all
  within 60 seconds of first opening it.
- **SC-002**: A citizen can complete and submit a new incident report within 30
  seconds of opening the report form.
- **SC-003**: The app opens directly to an interactive map with no splash
  screen, onboarding, or mandatory setup step, on first launch.
- **SC-004**: 100% of core features (view, report, verify) remain usable with
  no internet connection, and 100% of offline-created items sync successfully
  once connectivity returns.
- **SC-005**: Map loads fetch only incidents within the visible area; panning
  to an empty area never downloads the global dataset.
- **SC-006**: Every image captured or uploaded is reduced to at most 250 KB
  before leaving the device.
- **SC-007**: Synchronisation batches multiple pending items into a single
  transfer rather than one transfer per item, keeping bandwidth usage minimal
  on metered or congested networks.
- **SC-008**: No citizen is ever asked to register, log in, provide an email,
  or provide a phone number to use any feature.
- **SC-009**: Incident trustworthiness is always explainable in plain language
  ("Confirmed by X people") with no opaque or AI-derived scoring.
- **SC-010**: The running infrastructure cost approaches zero when the app is
  idle and scales only with actual usage, with no always-on servers to
  administer.

## Assumptions

- The full technology stack, repository layout, and infrastructure model are
  fixed by the project constitution (`.specify/memory/constitution.md`). This
  spec deliberately describes behaviour, not implementation; plan and tasks
  phases will bind these requirements to the mandated stack.
- Frontend static assets (the PWA) are hosted on Netlify for simple,
  pay-as-you-go scaling; the backend (API, Lambda, DynamoDB, and the image S3
  bucket) remains on AWS. This hosting split is codified in the constitution
  (Principle III, v1.2.0).
- Citizens have a device with GPS or can manually position themselves on the
  map; the app does not need to work on devices with no location capability at
  all.
- The map background tiles come from a free, publicly available map source;
  citizens are responsible for their own data connectivity to load tiles,
  though incident data works offline once cached.
- A "negative vote" is any verification action that reduces confidence
  (i.e. "situation worsened"); "situation improved" counts as a confirmation,
  and "no longer exists" sets status to "resolved" without affecting the score,
  per the clarification session.
- Changing a citizen's alias updates the alias shown on their future reports;
  previously created reports retain whatever alias was active at creation time,
  so historical attribution stays stable.
- Image upload happens after the parent report is successfully created; if the
  report syncs but the image cannot, the report is still visible and the image
  retries independently.
- The target audience is ordinary citizens under stress in poor conditions, so
  every interaction optimises for speed, clarity, and legibility outdoors over
  completeness or polish.
