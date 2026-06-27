# Quickstart: CrisisMap MVP

**Feature**: 001-crisis-map-mvp | **Date**: 2026-06-27

How to set up, run locally, and verify the CrisisMap MVP on this Windows +
PowerShell 7+ host. The stack is fixed by the constitution: Angular PWA
(frontend, deployed to Netlify) + AWS Lambda/API Gateway/DynamoDB/S3 (backend,
deployed via CDK with the `arkem` profile).

## Prerequisites (already satisfied)

- Node.js 20.x and npm.
- AWS CLI v2 (installed; profile `arkem` configured).
- PowerShell 7+ (this host).
- AWS CDK CLI: `npm install -g aws-cdk`.

> All AWS/CDK commands MUST use the `arkem` profile:
> `$env:AWS_PROFILE = "arkem"` or `--profile arkem`.

---

## 1. Repository setup

```powershell
# from repo root
git clone <repo> crisis-map
cd crisis-map
git checkout 001-crisis-map-mvp

# install dependencies (monorepo workspaces or per-package)
npm install
```

---

## 2. Backend (AWS Lambda + CDK)

### 2a. Local dev

Lambda handlers run under Node 20. Run unit/integration tests:

```powershell
# from backend/
Set-Location backend
npm install
npm test            # Jest unit + integration (mocked DynamoDB/S3)
Set-Location ..
```

For live DynamoDB during local dev, optionally run dynamodb-local and point the
handlers at it via `DDB_ENDPOINT` env var.

### 2b. Deploy the backend stack

```powershell
$env:AWS_PROFILE = "arkem"
Set-Location backend/cdk
npm install
cdk bootstrap       # once per account/region (uses arkem profile)
cdk deploy          # provisions API Gateway, Lambda, DynamoDB, S3, IAM
Set-Location ../..
```

`cdk deploy` prints the API Gateway base URL (e.g.
`https://abc123.execute-api.<region>.amazonaws.com`). Note it for the frontend
config.

### 2c. Verify backend

```powershell
# health check
curl https://<api-id>.execute-api.<region>.amazonaws.com/health
# expected: {"status":"ok","time":...}

# legend (static)
curl https://<api-id>.execute-api.<region>.amazonaws.com/legend
```

---

## 3. Frontend (Angular PWA)

### 3a. Configure the API URL

Set the backend API base URL for local dev:

```powershell
# apps/web/src/environments/environment.ts (and environment.development.ts)
#   apiUrl: "https://<api-id>.execute-api.<region>.amazonaws.com"
```

### 3b. Run locally

```powershell
Set-Location apps/web
npm install
npm start           # ng serve, http://localhost:4200
```

The app should open directly to the map (no splash/onboarding). Location
permission prompts on first run.

### 3c. Verify the critical journey

1. Open `http://localhost:4200` — map fills ~90% of screen.
2. Tap **Report** → pick type + severity → submit in < 30 s.
3. Tap an incident → **Confirm** → count increases; a second confirm from the
   same browser/device is rejected.
4. Toggle **Confirmed only** filter — only incidents with `confirmations >= 2`
   show.
5. Go offline (DevTools → Network → Offline) → create a report → it is queued;
   go back online → it syncs in a batch.

### 3d. Frontend tests

```powershell
# from apps/web/
npm test            # Jasmine/Karma unit tests
npm run e2e         # Playwright (offline report -> sync journey)
```

---

## 4. Deploy the frontend (Netlify)

The frontend ships to Netlify, NOT S3/CloudFront (constitution Principle III).

```powershell
# build
Set-Location apps/web
npm run build       # outputs apps/web/dist/<app>

# Option A: Netlify CLI
npm install -g netlify-cli
netlify deploy --dir=dist/<app> --prod

# Option B: connect the repo in the Netlify UI
#   build command: npm run build
#   publish dir:   apps/web/dist/<app>
```

Set `apiUrl` in the production environment to the deployed API Gateway URL
before building.

---

## 5. Full-stack verification (acceptance smoke test)

After both are deployed, confirm the MVP success criteria end to end:

- [ ] Open the app on a phone → map appears immediately (< 60 s to first
      useful action).
- [ ] Create + submit a report within 30 s.
- [ ] Confirm an existing incident from a second device.
- [ ] Airplane mode: create a report offline → re-enable → it syncs in a batch.
- [ ] `GET /incidents?bbox=...` returns only viewport incidents, not all.
- [ ] Uploaded image is ≤ 250 KB and ≤ 1280 px.

---

## Notes

- No `git init` — repo is already initialized.
- Do not commit secrets or the `arkem` credentials anywhere.
- All shell commands are PowerShell; do not use bash variants on this host.
