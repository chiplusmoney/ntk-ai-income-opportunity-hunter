# Build Receipt — M4 (Hunter API, Firestore Writer and AI Integration)

Date: 2026-10-14
Verdict: **M4_HUNTER_API_AND_AI_INTEGRATION_VERIFIED — emulator-verified; live Firebase deployment remains an owner gate**
Baseline package: `ARCHIVE/NTK_AI_Income_Opportunity_Hunter_M3_2026-10-14.zip`
(SHA-256 `60de23fd7604c71e71de45d1577df44a711cff1ae06beb369937ae7014d85e8e`)

## Verifications actually run

All commands were run from `WORKING/` on Node **24.20.0** (target runtime
`24.21.x`, pinned in `.node-version`).

| Command | Result |
|---------|--------|
| `npm install` (pinned ranges, no `latest`) | pass |
| `npm run typecheck` (core + web + worker + api) | pass, 0 diagnostics |
| `npm test` | **pass — 379 tests** (core 246, web 63, api 70); 12 skipped |
| `npm run build` | pass — 4 artifacts (core dist, web dist, worker dist, api dist) |
| `npm run verify:live` (M3 suite, re-run) | **pass** — 7 checks, all 7 endpoints HTTP 200 |
| `npm run verify:emulator` | **pass** — 5 integration tests against the Firestore emulator |

Skipped by default, and why: 7 live provider tests (need outbound network) and 5
emulator tests (need the emulator harness). Both suites were run explicitly and
passed; they are gated only so an offline `npm test` still works.

### Live provider re-verification (2026-10-14)

```
remotive:        ok=true status=200 bytes=188598   seen=15  candidates=15
remoteok:        ok=true status=200 bytes=600835   seen=99  candidates=99
arbeitnow:       ok=true status=200 bytes=2400434  seen=300 candidates=300
github-bounties: ok=true status=200 bytes=160255   seen=30  candidates=30
devpost:         ok=true status=200 bytes=9770     seen=9   candidates=9
hn-freelancer:   ok=true status=200 bytes=42003    seen=20  candidates=20
freelancer-rss:  ok=true status=200 bytes=76300    seen=20  candidates=20
github limits: search=10/min core=60/hr
```

### Emulator verification (Firestore)

`npm run verify:emulator` starts the Firestore emulator (Firebase CLI + Temurin
21, already present on this machine) and runs the gated integration suite:

- writes a verified opportunity, its evidence and the run audit document, then
  **reads them back** and asserts the published contract survived the round trip
  (`visibility`, `zeroCapital`, `capitalStatus`, `rankScore`, `updatedAt`, a
  64-hex `contentHash` on the evidence document);
- a repeat crawl updates the same documents instead of duplicating them;
- the run-document state is read back and used to decide what is due;
- a replayed run with a fixed clock produces identical counts.

This is emulator evidence, **not** live-deployment evidence.

## What M4 delivers

### 1. Zero-capital semantics fixed and made durable

`capitalStatus: 'confirmed_free' | 'unconfirmed_no_cost_found' | 'capital_required'`
now flows from the zero-capital engine through the pipeline, the published
document, the evidence document, the UI model and the screens. Tests pin the
distinction at every layer:

- `assessZeroCapital` reports `unconfirmed_no_cost_found` with
  `upfrontCostUsd: null` when the posting is merely silent;
- `toPublished` **throws** rather than publishing a capital-required candidate,
  so a false "$0" can never be stored;
- the UI shows "Confirmed $0 upfront" versus "No upfront cost found — verify
  before proceeding", both worded from one table in core;
- a record from before the field existed is treated as **unconfirmed**, never as
  free (offline cache and mapper both).
- The bundle was checked: both wordings are present in the shipped client, and
  `AIza`/service-account/`private_key` patterns are absent.

### 2. Reproducible runtime

Every dependency is pinned to an exact resolved version in all four workspaces;
no `latest` remains in any manifest. `.node-version` = `24.21.0`, and `engines`
accepts `>=24.20.0 <25.0.0` so the verified local runtime and the Render target
both install cleanly. `@vitejs/plugin-react` was removed: there is no
`vite.config.ts`, so the plugin was never active.

### 3. Hunter API (`services/hunter-api`)

Express 5, strict TypeScript, no pipeline logic of its own — it calls
`runHunt()`. Endpoints: `/health`, `/ready`, `/internal/hunt`,
`/internal/scheduler/run`, `/internal/status`.

- **Authentication:** constant-time digest comparison, `x-ntk-hunter-secret`
  (the header the deployed worker already sends) or bearer; **fails closed** with
  503 when the server has no credential; the value never reaches a log line or a
  response body.
- **Single-flight:** a concurrent trigger gets `409 busy` and does not start.
- **Interval-aware:** the plan comes from core's `planCrawl`, so a 30-minute
  heartbeat cannot become a 30-minute crawl of Remotive (360 minutes).
- **Cold-start tolerant:** the service is stateless, reads its scheduling state
  back from the run documents, and needs no warm-up ping.

### 4. Firestore server writer

Firebase Admin SDK, three collections, all through the validated contract:

- `opportunities/{sourceId}:{sourceItemId}`
- `opportunityEvidence/{same id}`
- `internalSourceRuns/{sourceId}_{startedAt}`

Guarantees: validation before every write (a document Firestore would reject is
skipped and reported, never fatal), deterministic ids, `set` semantics so a repeat
crawl updates rather than duplicates, per-chunk failure containment, no
`undefined`, oversized documents rejected, and a `WriteReport` that distinguishes
staged / written / skipped / failed.

**Correction found while wiring the SDK:** `internal/sourceRuns/{id}` is not an
addressable Firestore document path — the alternation makes `{id}` a collection.
The audit collection is now the top-level `internalSourceRuns`, with an explicit
`allow read, write: if false` rule added.

### 5. Authentication and profile persistence

`apps/web/src/auth/userProfile.ts` holds the profile contract: primary market,
additional markets, skills, categories, zero-cost preference, direct-pay
preference, CV/portfolio preferences, competition preference, notification
channels and the paid-AI flag. `ProfileRepository` validates then writes
`users/{uid}` through an injected gateway, **refuses a uid that does not match
the authenticated uid**, and reports exactly which fields it normalised.
22 tests cover defaults (NG + GB/CA/US + global, competitions off), alias
normalisation, taxonomy rejection, non-boolean coercion, skill bounding and the
cross-account refusal.

### 6. FlagshipRouter integration and AI safety

New `packages/core/src/ai/`:

- `capability.ts` — the app requests a **capability**, never a model name.
- `router.ts` — free-first selection: least capable sufficient free model first,
  stronger free only when needed, paid only when authorised *and* no free model
  meets the threshold, otherwise the best free model with an explicit
  `confidenceAdjustment < 1`.
- `freeLlmApi.ts` — the provider pool as a **separate** adapter; a test asserts
  `router.ts` and `freeLlmApi.ts` do not import each other (no source-merge).
- `analysis.ts` — builds the only input a model may see (normalized data +
  references), and validates the response: reward, currency, deadline,
  eligibility, remote, CV, cost status, trust and visibility are
  **evidence-owned** and rejected if a model tries to set them; any attempt to
  assert something is free is rejected; a scam block cannot be cleared; rank
  adjustment is clamped to ±10 and stays inside 0..100; every accepted result
  carries evidence references and model metadata.

`runHunt` does not import the AI layer at all: the deterministic hunter works
with every model and router unavailable, and a test asserts that.

### 7. Source compliance

The three dormant adapters were reviewed against the providers' own terms
(`docs/SOURCE_COMPLIANCE_REVIEW.md`, every verdict tied to a quoted sentence):

| Source | Verdict | Basis |
|--------|---------|-------|
| Hacker News via Algolia | **enabled** | API published for programmatic access; 10,000 req/hour/IP budget documented; prohibitions reach Site scraping and commercial use, neither of which applies |
| Devpost | **stays off** | Terms §4 prohibits automated access to the Site "or any related data or information" |
| Freelancer.com | **stays off** | User Agreement §33 requires express written permission for automated access; §4(11) bans cross-site aggregation; API T&Cs §5.3 bars storing the data **or its hash** |

The Freelancer finding is worth singling out: the terms forbid the *hashed
evidence* pattern this project uses, so "the feed is public" was never the
question. Five sources now serve; two are off with a quotable reason.

## Failures found and fixed during M4

1. **Unnormalisable market silently defaulted.** A supplied but invalid
   `primaryCountry` produced no problem record; the validator now reports it.
2. **Absent vs empty market list conflated.** An absent `additionalCountries`
   took defaults (correct), but so did an explicitly empty list, which would
   re-add markets a user had removed. Now distinguished, with a test.
3. **`internal/sourceRuns/{id}` is not a valid Firestore path** (see §4).
4. **The in-memory document store was an append log**, so "same document count"
   assertions were meaningless; it now has Firestore's set semantics.
5. **A garbled assertion** in the idempotency test (my own error) was replaced
   with one that actually checks the document set.
6. **Worker build path:** the API consumes `@ntk/hunter-core` from `dist`, so core
   gained a real build (`tsconfig.build.json`, declarations) and root
   `typecheck` builds core first.
7. **Windows shell quoting** broke `firebase emulators:exec`; the harness now
   invokes the CLI's JS entry point directly, and resolves it from the home
   directory because `APPDATA` is not set in a non-interactive shell.

## Not done, and not claimed

- **No live Firebase project.** Rules, indexes and the emulator run are not a
  deployment; nothing has been written to a real project, and no credentials
  exist in this environment (`GOOGLE_APPLICATION_CREDENTIALS` unset).
- **No real FlagshipRouter or FreeLLMAPI call.** Routing is tested with injected
  model candidates. No provider endpoint was contacted.
- **No Render deployment.** The service builds and runs locally; the Render
  service, its environment variables and its health check are unproven.
- **Browser/PWA acceptance was NOT run.** The browser pane refuses
  `localhost`/private targets and could not attach to a workspace file URL, so
  mobile/tablet/desktop renders, installed-PWA behaviour, and the
  online→offline→reconnect cycle were not exercised. What exists instead:
  the production build succeeds, the shipped bundle contains both cost wordings
  and no credential patterns, and 63 web unit tests cover mapping, filters,
  repository fallback, cache coercion and profile persistence. That is not a
  substitute, and no acceptance is claimed.
- **The Cloudflare worker file is unchanged** (`workers/hunter-scheduler/src/index.ts`
  is byte-identical to the M3 package). Every write to it was refused by the
  workspace safety guard as a false positive on the
  `HUNTER_SHARED_SECRET: string` env binding, and the guard's own message says to
  let the owner decide. It already calls `POST /internal/hunt` with
  `x-ntk-hunter-secret`, which is exactly what this API serves, so the deployed
  flow works as-is; the ready-to-apply improvement (interval policy header,
  bounded retry) is in `docs/WORKER_WIRING_PATCH.md`.
- **No daily yield measurement.** The pipeline's reject rate on live feeds is
  unmeasured in production.

## Next milestone — M5

1. Deploy the Hunter API to Render, set the environment, prove one live Firestore
   write, then deploy rules and indexes.
2. Run the mobile/tablet/desktop and offline acceptance in a real browser.
3. Apply the worker wiring patch and verify a real cron-triggered run.
4. Notifications (FCM/email/Telegram).
