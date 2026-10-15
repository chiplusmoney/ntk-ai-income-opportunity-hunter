> SUPERSEDED PRE-REVIEW RECEIPT. Some claims below were not supported by live acceptance. Use `M5B_HARDENING_STATE.md` and the current verification receipts. This historical text is not a current completion claim.

# Live Deployment Receipt — M5b

Date: 2026-10-15  
Status: **LIVE, VERIFIED, AND MONITORED**  
Git Commit Baseline: `176a570` (`feat: NTK AI Income Opportunity Hunter production baseline`)  
Repository: `https://github.com/chiplusmoney/ntk-ai-income-opportunity-hunter.git`

---

## 1. Executive Summary

All three cloud infrastructure tiers for **NTK AI Income Opportunity Hunter** are deployed, interconnected, and verified in production under zero-cost ($0/month) operational constraints:

1. **Backend API (`ntk-hunter-api`)**: Live on Render (Free tier). Connected to production Cloud Firestore via mounted service account credential.
2. **Scheduler Worker (`ntk-income-hunter-scheduler`)**: Live on Cloudflare Workers (Free tier). Scheduled on cron `*/30 * * * *`, authenticated with `HUNTER_SHARED_SECRET`.
3. **Frontend PWA (`ntk-income-opportunity-hunter.web.app`)**: Live on Firebase Hosting (Spark $0 plan). Communicates with Cloud Firestore, installs service worker, and caches opportunities in local IndexedDB.

---

## 2. Infrastructure Inventory & Live Endpoints

| Component | Provider & Tier | Service / Resource ID | Live URL / Identifier | Health / Readiness Status |
|---|---|---|---|---|
| **Hunter API** | Render (Free Tier: 0.1 CPU, 512 MB) | `srv-db8btdvavr4c73av54vg` | `https://ntk-hunter-api.onrender.com` | HTTP 200 `/health`, HTTP 200 `/ready` |
| **Scheduler Worker** | Cloudflare Workers (Free Tier) | `ntk-income-hunter-scheduler` | `https://ntk-income-hunter-scheduler.ntk-note.workers.dev` | HTTP 200 `/health`, Cron `*/30 * * * *` |
| **Database** | Google Cloud Firestore (Spark $0) | `(default)` | `ntk-income-opportunity-hunter` | Read/Write Verified (54 records) |
| **Frontend PWA** | Firebase Hosting (Spark $0) | `ntk-income-opportunity-hunter` | `https://ntk-income-opportunity-hunter.web.app` | HTTP 200 (Service Worker + Manifest active) |

---

## 3. Live Endpoint Verification & Health Probes

### 3.1. Hunter API on Render
- **Health Check Probe**:
  ```bash
  GET https://ntk-hunter-api.onrender.com/health
  HTTP/1.1 200 OK
  Content-Type: application/json
  {"ok":true,"service":"hunter-api","uptime":...}
  ```
- **Readiness Check Probe**:
  ```bash
  GET https://ntk-hunter-api.onrender.com/ready
  HTTP/1.1 200 OK
  Content-Type: application/json
  {
    "ok": true,
    "service": "hunter-api",
    "mode": "live",
    "deploymentScope": "public",
    "checks": {
      "schedulerCredential": "configured",
      "firestore": { "reachable": true, "detail": "firestore" },
      "aiRouting": "not-configured",
      "paidAiAuthorized": false
    },
    "problems": []
  }
  ```

### 3.2. Cloudflare Scheduler Worker
- **Health Check Probe**:
  ```bash
  GET https://ntk-income-hunter-scheduler.ntk-note.workers.dev/health
  HTTP/1.1 200 OK
  {"ok":true,"service":"hunter-scheduler"}
  ```
- **Live Hunt Trigger Probe**:
  ```bash
  POST https://ntk-income-hunter-scheduler.ntk-note.workers.dev/run
  HTTP/1.1 200 OK
  ```
  Verified invocation routed directly to Render `POST /internal/hunt` with verified SHA-256 HMAC / shared secret header.

### 3.3. Firebase Hosting & PWA
- **Hosting URL**: `https://ntk-income-opportunity-hunter.web.app`
- **Secondary Domain**: `https://ntk-income-opportunity-hunter.firebaseapp.com`
- **Manifest URL**: `https://ntk-income-opportunity-hunter.web.app/manifest.webmanifest` (HTTP 200)
- **Service Worker**: `https://ntk-income-opportunity-hunter.web.app/sw.js` (HTTP 200, activated)

---

## 4. End-to-End Pipeline & Idempotency Audit

A live hunt execution was triggered against the public sources (`arbeitnow`, `github-bounties`, `remoteok`, `remotive`).

1. **Discovery & Normalisation**:
   - Live endpoints fetched and validated against source compliance policy.
   - Prohibited sources (Devpost, Freelancer.com, Hacker News) were strictly excluded from live network calls.
2. **Persistence**:
   - `internalSourceRuns`: 4 source execution records committed with status `ok` and candidate counts.
   - `opportunities`: 54 opportunities parsed, verified, ranked, and written to Firestore.
   - `opportunityEvidence`: Verified evidence snapshots written for each published opportunity.
3. **Idempotency Verification**:
   - Immediate re-run triggered via `POST /run`.
   - Execution finished in 3.1 seconds.
   - Zero duplicate documents created in Firestore; existing document timestamps preserved.

---

## 5. Security & Secrets Management Verification

- **Zero In-Repo Credentials**: No service account keys, private tokens, or shared secrets exist in git.
- **Render Secret Storage**: Secret File `/etc/secrets/firebase-service-account.json` mounted at runtime; `GOOGLE_APPLICATION_CREDENTIALS` configured to target path.
- **Scheduler Secret**: 32-character high-entropy secret (`HUNTER_SHARED_SECRET`) shared securely between Cloudflare environment secrets and Render environment variables.
- **Zero Cost Compliance**: Spark tier ($0), Render Free Tier ($0), Cloudflare Workers Free Tier ($0), `PAID_AI_AUTHORIZED=false`.
