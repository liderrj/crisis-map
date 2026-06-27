<!--
Sync Impact Report
- Version change: 1.1.0 → 1.2.0
- Modified principles: III "Serverless & Low-Cost on AWS" → "Serverless &
  Low-Cost Hosting" (hosting model redefined: frontend → Netlify, backend +
  image storage remain on AWS CDK; core serverless/low-cost tenet preserved).
- Added sections: (none)
- Removed sections: (none)
- Templates requiring updates: plan-template.md ✅ updated (Constitution Check
  gate III rewritten for the split hosting model), spec-template.md ✅ aligned,
  tasks-template.md ✅ aligned. Spec Assumptions note updated to reflect the
  amendment is complete.
- Deferred: none.
-->
# CrisisMap Constitution

## Core Principles

### I. Mobile-First & Offline-First

The product is a Progressive Web App built for citizens in disaster zones, where
connectivity is intermittent and bandwidth is precious.

- The UI MUST be mobile-first, responsive, installable as a PWA, and readable in
  direct sunlight (high contrast, large buttons, no decorative graphics).
- All user-facing features MUST work fully offline; nothing MUST depend on a
  live network connection to function.
- Reports, confirmations, and pending uploads MUST persist locally in IndexedDB
  and MUST be drained from a pending queue automatically when connectivity
  returns.
- No splash screens, no onboarding, no animations. Opening the app MUST show
  the map immediately.

### II. Zero-Friction Identity (No Authentication)

There is no administrator and no registration. Identity is local and ephemeral.

- The system MUST NOT collect email, phone, name, or password.
- On first launch the client MUST generate a UUID, store it locally, and reuse
  it on every subsequent launch.
- The user MAY optionally set or change an alias at any time; the alias MUST be
  stored only on the device and sent with each request.
- The server MUST treat `deviceId` as the sole identity primitive; no session,
  cookie, or token infrastructure is allowed.

### III. Serverless & Low-Cost Hosting

The system MUST be 100% serverless and MUST scale to near-zero cost when idle.
Hosting is split across two providers by concern: the frontend on Netlify, the
backend and image storage on AWS.

- The system MUST be entirely serverless: no long-running servers, no
  containers, no always-on databases.
- The backend (API, business logic, data, and image storage) MUST run on AWS:
  AWS Lambda functions behind an API Gateway HTTP API, backed by DynamoDB, with
  an S3 bucket for user-uploaded images.
- All backend infrastructure MUST be defined in AWS CDK under `backend/cdk` and
  MUST deploy via `cdk deploy` (using the `arkem` AWS profile) from a clean
  checkout.
- The frontend PWA (static assets under `apps/web`) MUST be hosted on Netlify
  for simple, pay-as-you-go scaling. The frontend MUST NOT be deployed to
  S3 or CloudFront.
- Deployment is therefore two-step and fully automated: `cdk deploy`
  provisions the backend stack, and a separate Netlify publish (Netlify CLI or
  CI) ships the frontend. Neither step MUST require manual AWS-console work.
- The image S3 bucket MUST be served to clients through the backend API or a
  CloudFront distribution in front of that single image bucket — not as the
  frontend origin.
- Logs MUST go to CloudWatch Logs; IAM MUST follow least-privilege.
- A custom domain via Route53 will be attached later; the stacks MUST NOT
  hard-code a domain today.

### IV. Community-Verified Truth, No AI

Information quality is the community's responsibility; the system only stores
and displays it.

- The system MUST NOT use any form of AI, ML, or heuristic ranking. Decisions
  about what is true are made by nearby users.
- Every new incident starts with exactly 1 confirmation (the creator's implicit
  confirmation).
- A device MUST NOT be able to confirm or vote on the same incident twice.
- Confidence is a deterministic calculation:
  `confidence = max(0, confirmations - negativeVotes)`.
- Duplicate prevention: when creating a report, the client MUST search for
  existing incidents of the same type within 30 meters; on a hit, the user
  MUST be asked to either confirm the existing incident or create a new one.
- There is no manual moderation role. The community keeps information current
  through confirmations and votes.

### V. Performance & Bandwidth Discipline

The system MUST function on slow, congested, or metered networks.

- The client MUST load only incidents inside the current map bounding box; it
  MUST NEVER request or render the full incident set.
- Sync MUST be batched; clients MUST NOT issue one HTTP request per report.
- Sync triggers are exactly: app start, manual refresh, and every 30 seconds
  while online.
- Images MUST be compressed client-side before upload: longest side ≤ 1280 px,
  payload ≤ 250 KB, WebP preferred.
- API payloads MUST be paginated and compressed; responses MUST be JSON only.
- Marker clustering MUST be enabled on the Leaflet map and MUST expand on zoom.
- Performance success criterion: any citizen MUST be able to open the app,
  see nearby incidents, report a new one, and confirm an existing one in under
  one minute on first use.

## Technical Constraints

- **Development environment**: the host is Windows running PowerShell 7+. All
  shell commands, scripts, and CDK invocations MUST be formulated for
  PowerShell (not bash) unless explicitly noted otherwise.
- **AWS CLI**: the AWS CLI v2 is already installed on this machine. Agents
  MUST NOT attempt to install, bootstrap, or upgrade it. Verified version at
  ratification: `aws-cli/2.33.11` on Windows 11.
- **AWS profile**: the default and only AWS profile to use for every CLI and
  CDK command in this project is `arkem` (e.g. `aws --profile arkem ...`,
  `$env:AWS_PROFILE = "arkem"`). Commands MUST NOT be run against any other
  profile, and MUST NOT assume `default` resolves to the right account.
- **Repository layout**: monorepo with `apps/web` (Angular PWA frontend) and
  `backend/` containing `cdk/` (infrastructure as code), `lambdas/` (Lambda
  handlers), and `shared/` (cross-cutting types and utilities).
- **Frontend**: Angular PWA, Leaflet on OpenStreetMap tiles, marker clustering,
  IndexedDB for local persistence. No heavy UI libraries, no animations, no
  unnecessary dependencies. Hosted on Netlify (static assets); deployed via
  Netlify CLI or CI, not S3/CloudFront.
- **Backend**: AWS Lambda, stateless, REST API, JSON only. No GraphQL.
  Provisioned via AWS CDK (`cdk deploy`, `arkem` profile).
- **Database**: DynamoDB with simple tables only. Required tables and shapes:
  - `Incidents`: `incidentId`, `location`, `geohash`, `type`, `status`,
    `description`, `severity`, `createdAt`, `updatedAt`, `creatorAlias`,
    `confirmations`, `negativeVotes`, `imageCount`.
  - `Confirmations`: `incidentId`, `deviceId`, `action`, `createdAt`.
  - `Devices`: `deviceId`, `alias`, `createdAt`.
- **Required API endpoints**: `GET /incidents`, `GET /incidents?bbox=`,
  `POST /incidents`, `POST /confirmations`, `POST /images`, `GET /resources`,
  `GET /legend`, `GET /health`.
- **Marker colour taxonomy** is part of the contract: Red=Emergency,
  Orange=Infrastructure damage, Yellow=Service interruption, Green=Available
  resource, Blue=Communications.
- **Incident types** are a closed enum of 20 values (People trapped, Building
  collapse, Damaged building, Fire, Flood, Road blocked, Bridge damaged,
  Landslide, Hospital, Shelter, Food, Water, Medicine, Electricity, Fuel,
  Internet, Starlink, Open WiFi, Charging Point, Other). Adding a type
  requires a constitution amendment.

## Development Workflow

- This is **not** a social network, not a chat app, and not a rescue
  coordination platform. It is only a collaborative incident map. Feature
  requests that violate this scope MUST be rejected.
- Spec-Kit SDD cycle is mandatory: `speckit.constitution` →
  `speckit.specify` → `speckit.clarify` → `speckit.plan` → `speckit.tasks` →
  `speckit.implement`, with review gates between phases.
- All work happens on a numbered feature branch
  (`NNN-kebab-case`); specs, plans, and tasks MUST NOT be committed to
  `main`.
- Community moderation replaces dedicated admins; design discussions about
  moderation features MUST default to "the community handles it".
- Every feature MUST be evaluated against the MVP goal: in under one minute,
  any citizen must be able to open the app, see nearby incidents, report a
  new incident, confirm an existing one, and continue using the app offline.

## Governance

- This constitution supersedes all other development practices, design
  preferences, and ad-hoc decisions for the CrisisMap project.
- Amendments require: (1) a written rationale, (2) explicit user approval,
  (3) a `docs: amend constitution` commit, and (4) a Sync Impact Report at
  the top of `constitution.md` describing version, principle diffs, and
  affected templates.
- Versioning follows semver:
  - **MAJOR**: removal or redefinition of a principle in a backward-incompatible
    way.
  - **MINOR**: addition of a new principle or materially expanded guidance.
  - **PATCH**: clarifications, wording, typo fixes.
- Every spec, plan, and task MUST be checked against this constitution before
  approval. The `Constitution Check` gate in `plan.md` MUST be filled with the
  list of principles and pass before implementation begins.
- Compliance review: any PR or feature proposal that violates a principle
  MUST either be rejected or accompanied by a justified exception recorded
  under "Complexity Tracking" in `plan.md`.

**Version**: 1.2.0 | **Ratified**: 2026-06-27 | **Last Amended**: 2026-06-27