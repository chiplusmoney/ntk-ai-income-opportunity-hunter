# Hunter API (`services/hunter-api`)

The backend pipeline stage: **Cloudflare scheduler → Hunter API → deterministic
Hunter Core → optional FlagshipRouter analysis → Firestore → PWA**.

It calls `runHunt()` from `@ntk/hunter-core` and does not reimplement any part of
the pipeline. The deterministic evidence system remains the source of truth.

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | none | Liveness. No config, no I/O, no secrets. |
| GET | `/ready` | none | Readiness. Reports *which* configuration is missing, never a value. 503 when unusable. |
| POST | `/internal/hunt` | shared secret | Authenticated scheduler trigger. **This is the path the deployed Cloudflare worker already calls.** |
| POST | `/internal/scheduler/run` | shared secret | Alias with the same contract. |
| GET | `/internal/status` | shared secret | Safe run summary: counts, per-source state. No secrets, no URLs, no payloads. |

Request body (all fields optional):

```json
{ "reason": "cron-30m", "sources": ["remotive"], "force": false }
```

`409 busy` means another run holds the single-flight lock: this trigger did **not**
run, and a retry is safe because writes are idempotent.

## Authentication

The scheduler presents the shared secret in `x-ntk-hunter-secret` (or
`Authorization: Bearer …`). Comparison is constant-time over SHA-256 digests, the
value is never logged, and **with no secret configured on the server every trigger
is refused (503)**: there is no "no auth" mode and no default secret.

The browser never sees this secret: it lives only in the Cloudflare worker's
environment and the Render service environment.

## Environment

| Variable | Required | Notes |
|----------|----------|-------|
| `HUNTER_SHARED_SECRET` | yes | ≥16 chars. Server refuses triggers without it. |
| `FIREBASE_PROJECT_ID` | live mode | Project id for the Admin SDK. |
| `GOOGLE_APPLICATION_CREDENTIALS` | live mode | Path to a service-account JSON on the host. Never commit it. |
| `FIRESTORE_EMULATOR_HOST` | emulator mode | Set (e.g. `127.0.0.1:8080`) to use the emulator instead of a project. |
| `FLAGSHIP_ROUTER_URL` | optional | Capability API base URL. Absent means no AI stage. |
| `FLAGSHIP_ROUTER_API_KEY` | optional | Router credential, server-side only. |
| `PAID_AI_AUTHORIZED` | optional | Defaults to `false`. Paid models are never used without it. |
| `PORT` | optional | Defaults to `8080` (Render sets this). |
| `RUN_TIMEOUT_MS` | optional | Defaults to `120000`. |
| `LOG_LEVEL` | optional | `debug` \| `info` \| `warn` \| `error`. |

### Firestore on the Spark (free) plan

The Spark plan supports the Admin SDK for Firestore with default rules and
quotas. This service enables **no** paid service, no Cloud Functions, no Blaze
billing. It writes three collections and reads one back for scheduling state.

## Run locally

```bash
cd WORKING
npm install
npm --workspace packages/core run build     # the API consumes the built package
npm --workspace services/hunter-api run typecheck
npm --workspace services/hunter-api run test

# against the emulator, no credentials needed
npm run verify:emulator

# serve it (set the env first)
npm --workspace services/hunter-api run build
npm run start:api
```

## Deploying to Render

- **Build command:** `npm install && npm --workspace packages/core run build && npm --workspace services/hunter-api run build`
- **Start command:** `npm --workspace services/hunter-api run start`
- **Health check path:** `/health` (Render's probe must not require the secret, or the service looks unhealthy)
- Node runtime: `24.21.x` (`.node-version`). `engines` accepts `>=24.20.0 <25`.

Do not add a keep-alive ping: the service is designed to cold-start, and the
Cloudflare heartbeat only triggers when a source is actually due.

## What is proven, and what is not

Proven by tests in this package:

- authentication (missing, wrong, wrong-length, prefix, server-unconfigured), and that the credential never reaches a response body or a log line;
- the writer: validation before write, deterministic ids, idempotent re-crawls, per-chunk failure containment, no `undefined`, no oversized document;
- orchestration: interval-aware planning, single-flight, partial and total source failure, AI unavailable/refusing/throwing;
- routes over a real HTTP listener: status codes, bodies, 404, 409.
- **Firestore emulator integration**: recorded provider payload → adapter → deterministic verification → accepted opportunity → Firestore document → read back, plus idempotent repeats.

Not proven (owner gates):

- a live Firebase project: rules and indexes are written but never deployed;
- Application Default Credentials on Render;
- FlagshipRouter connectivity: the router is exercised with injected model
  candidates, never against the real service.
