# Live Deployment Receipt — M5

Date: 2026-10-15

## Verdict

**NOT DEPLOYED.** No live Firebase project, no Render service and no Cloudflare
Worker were created or deployed in this milestone, because no owner credentials
for those platforms exist in this environment. Nothing in this document should be
read as evidence of a running deployment.

## What was checked, and what was found

| Platform | Check performed | Finding |
|----------|-----------------|---------|
| Firebase | `GOOGLE_APPLICATION_CREDENTIALS` env | **not set** |
| Firebase | service-account JSON anywhere in the workspace | **none found** |
| Firebase | any `FIREBASE_*` / `GCLOUD_*` / `GOOGLE_*` env var | **none set** |
| Render | account or API key | **not available** |
| Cloudflare | account, API token or `wrangler` authentication | **not available** |
| Local | Java (Firestore emulator) | present — Temurin 21 |
| Local | Firebase CLI | present — used for the emulator only |

So the deployed half of the M5 pipeline is unstarted rather than failed.

## What IS verified locally (and labelled as such everywhere)

- The Hunter API builds and starts from `services/hunter-api` using the documented
  commands; `/health` and `/ready` are covered by route tests over a real HTTP
  listener, including the `503` path when configuration is missing.
- The Firestore writer's full path is proven against the **emulator**:
  recorded provider payload → adapter → deterministic verification → accepted
  opportunity → Firestore document → read back, with idempotent re-crawls.
- The security rules are proven behaviourally against the **emulator** with
  emulated auth contexts (15 assertions).
- All seven provider endpoints respond `200` to the live verification suite.

None of that is a deployment.

## SECRET REQUIRED

```
SECRET REQUIRED:
Firebase service-account JSON (Admin SDK credentials for the Hunter API)

WHERE IT SHOULD BE CONFIGURED:
Render → the hunter-api service → Secret File, mounted at a runtime path, with
GOOGLE_APPLICATION_CREDENTIALS pointing at that path. The JSON itself must never
be committed to the repository or pasted into a chat.

STATUS:
NOT CONFIGURED
```

```
SECRET REQUIRED:
Shared secret used between the Cloudflare scheduler and the Hunter API
(the header the worker already sends)

WHERE IT SHOULD BE CONFIGURED:
Two places, same value: Render env var on the hunter-api service, and a
Cloudflare Worker secret. Never in the web bundle, never in the repository.

STATUS:
NOT CONFIGURED
```

```
SECRET REQUIRED:
Telegram bot token and bot id, for the Telegram notification channel

WHERE IT SHOULD BE CONFIGURED:
Render env var on the hunter-api service, server-side only.

STATUS:
NOT CONFIGURED (channel therefore not dispatched; policy and request builders are
tested, but no message has been sent)
```

```
SECRET REQUIRED:
Firebase web configuration (public client config) for the PWA

WHERE IT SHOULD BE CONFIGURED:
Build-time environment variables for the web app. This is public configuration,
not a credential, but it is unset, so the deployed PWA would fall back to the
labelled demo rows.

STATUS:
NOT CONFIGURED
```

```
SECRET REQUIRED:
FlagshipRouter endpoint URL and credential

WHERE IT SHOULD BE CONFIGURED:
Render env vars on the hunter-api service. The deterministic hunter runs without
them; the AI stage is optional by design.

STATUS:
NOT CONFIGURED (external project dependency; AI routing is exercised only with
injected model candidates)
```

## Exact steps to reach the M5 target verdict

1. **Firebase (Spark plan, no billing)**
   - create the project; note `FIREBASE_PROJECT_ID`
   - `firebase deploy --only firestore:rules,firestore:indexes` from `WORKING/`
   - enable Authentication (email/password, Google)
   - project settings → service accounts → generate a JSON key
2. **Render (free web service)**
   - root directory `WORKING/`, build command
     `npm install && npm --workspace packages/core run build && npm --workspace services/hunter-api run build`
   - start command `npm --workspace services/hunter-api run start`
   - health check path `/health`
   - env: the four values listed above plus `PAID_AI_AUTHORIZED=false` and
     `HUNT_DEPLOYMENT_SCOPE=public`; the service-account JSON as a Secret File
   - then prove: `GET /health`, `GET /ready`, `POST /internal/hunt` with the
     header, `POST /internal/hunt` **without** it (expect 401), and read the
     written documents back from Firestore
3. **Cloudflare Worker (free tier)**
   - deploy `workers/hunter-scheduler` with the wiring patch applied
     (`docs/WORKER_WIRING_PATCH.md`)
   - vars: `HUNTER_API_URL`, `DEFAULT_REGION_PRIORITY`; secret: the shared secret
   - cron trigger `*/30 * * * *` is a heartbeat; per-source intervals are enforced
     by the API, and a cold start is acceptable
4. **One live hunt** — trigger once, record the accepted/rejected counts, the
   document ids, and that a second trigger does not duplicate them.
5. **Browser acceptance** on a machine where the browser pane can attach.

## Free-tier position

No paid plan was attached, no Blaze billing enabled, no paid API added, no paid
Render service created. The Spark plan and the free Render and Cloudflare tiers
are the only intended targets, and nothing in this milestone commits the owner to
a cost.
