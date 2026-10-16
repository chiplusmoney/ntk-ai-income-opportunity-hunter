# NTK AI Income Opportunity Hunter

Current release: **0.4.1 � M5b_PARTIAL_CLOUDFLARE_ACCESS_BLOCKED** (2026-10-16). Hosting, API, Auth, real outcomes and the controlled Telegram delivery are verified. Existing Worker hardening and matching encrypted-secret rotation require access to its owning account. See [current hardening state](docs/M5B_HARDENING_STATE.md). M6 has not started.

Autonomous, zero-capital-first income opportunity discovery. The deterministic
evidence system is the source of truth; AI explains and ranks verified evidence
and never invents a missing fact.

## Architecture

```
Cloudflare Worker (cron heartbeat)
        |  POST /internal/hunt  +  x-ntk-hunter-secret
        v
Hunter API  (services/hunter-api, Render)
        |  runHunt()
        v
@ntk/hunter-core  (packages/core)
   registry -> adapters -> evidence -> dedupe -> zero-capital ->
   eligibility -> risk -> deterministic score
        |  validated documents
        v
Firestore  (opportunities / opportunityEvidence / internalSourceRuns)
        |
        v
PWA  (apps/web)  live read -> IndexedDB cache -> offline
```

Optional, and never on the critical path:

```
Hunter API -> FlagshipRouter (capability API) -> FreeLLMAPI provider pool
```

FlagshipRouter is the routing/control brain; FreeLLMAPI is an independent
provider pool. They are **not** source-merged (`packages/core/src/ai/`).

## Layout

- `packages/core` — `@ntk/hunter-core`: dependency-free domain core. Registry,
  adapters, evidence, reward parsing, pipeline, persistence contract, AI safety.
- `services/hunter-api` — the backend service: authenticated triggers, run
  orchestration, Firestore server writer, optional analysis.
- `apps/web` — React + TypeScript responsive PWA, offline-first.
- `workers/hunter-scheduler` — Cloudflare cron heartbeat (not a crawl cadence).
- `tools/` — live source verification, fixture capture, emulator harness.
- `docs/` — receipts, source compliance, data model, pipeline, deployment.

## Verify it

```bash
npm install
npm run typecheck        # core build + 4 workspaces
npm test                 # 379 tests (core 246, web 63, api 70)
npm run build            # core dist, web dist, worker dist, api dist
npm run verify:live      # real provider probes; fails if a feed changes shape or terms
npm run verify:emulator  # Firestore emulator: full path to a stored document
```

`verify:live` makes real outbound requests, so it is gated in normal test runs and
must be run before a handoff. `verify:emulator` needs Java and the Firebase CLI.

## Runtime

Node **24.21.x** (`.node-version`), `engines: >=24.20.0 <25`. All dependencies are
pinned to exact versions — no `latest` ranges — so a clean install is
reproducible.

## What is real today

| Source | Status | Basis |
|--------|--------|-------|
| Remotive | serving | terms quoted verbatim from the API's own legal notice; 360-minute interval |
| Remote OK | serving | terms quoted verbatim from the API's own legal notice |
| Arbeitnow | serving | terms quoted verbatim from the response `meta.terms` |
| GitHub issue bounties | serving | measured rate budget (10 search/min, 60 core/hr) |
| Hacker News via Algolia | **off for public scope**, serving in personal scope | permission to display to other users is unestablished — YC terms restrict distributing Site Content without express authorisation |
| Devpost | **off** | ToS §4 prohibits automated access to the Site or its data |
| Freelancer.com RSS | **off** | User Agreement §33 and API T&Cs §5.3 prohibit this use, including storing a hash |

Details and quotes: `docs/SOURCE_REGISTRY.md` and
`docs/SOURCE_COMPLIANCE_REVIEW.md` (the evidence review). What has actually been
proven, and what has not, is in `docs/BUILD_RECEIPT_M4.md`.

## Deployment scope — read this before deploying

Who a deployment serves changes which sources may be read. The registry records
both facts per source: `enabled` (may we read it?) and `publicDeploymentAllowed`
(may we show it to other people?).

`HUNT_DEPLOYMENT_SCOPE` selects the scope and **defaults to `public`**, the
stricter reading, so a missing or misspelled value can never widen what is
crawled. Only an explicit `personal` narrows it.

| Source | Public scope | Personal scope |
|--------|--------------|----------------|
| Remotive, Remote OK, Arbeitnow, GitHub bounties | served | served |
| Hacker News via Algolia | **not crawled** | served |
| Devpost, Freelancer RSS | not crawled (prohibited) | not crawled (prohibited) |

Every restriction names the fact that would lift it, in the registry entry
itself. Details and quoted evidence: `docs/SOURCE_REGISTRY.md`.

## Cost status — read this before wording a "$0" claim

The product never says "free" because it found no price. Three states exist:

| `capitalStatus` | Meaning | User-facing wording |
|-----------------|---------|---------------------|
| `confirmed_free` | The source states no upfront payment | "Confirmed $0 upfront" |
| `unconfirmed_no_cost_found` | No cost language found either way | "No upfront cost found — verify before proceeding" |
| `capital_required` | The source states a cost | never published; excluded by the default policy |

The wording lives in one place (`packages/core/src/capitalStatus.ts`) so no screen
can drift into a stronger claim than the evidence supports.

## Development workflow

Use `WORKING` for active implementation. `HANDOFF_TO_CHATGPT` holds only the
current verified handoff package. Superseded packages belong in `ARCHIVE`.

```bash
npm run dev               # web app on 0.0.0.0
npm run start:api         # Hunter API (build first)
node tools/capture-fixtures.mjs   # refresh recorded provider fixtures
```

## Documents

- `docs/BUILD_RECEIPT_M4.md` — M4: what was built, proven, emulator-verified and what is still an owner gate.
- `docs/BUILD_RECEIPT_M3.md` — M3: registry, evidence, deterministic verification.
- `docs/SOURCE_REGISTRY.md` — per-source verification record and conditions.
- `docs/SOURCE_COMPLIANCE_REVIEW.md` — provider terms review with quoted evidence.
- `docs/WORKER_WIRING_PATCH.md` — the one pending worker change and why it is pending.
- `docs/HUNTER_PIPELINE.md` — stages, score dimensions, weights, normalization.
- `docs/DATA_MODEL.md` — Firestore collections, cost fields, queries, indexes, offline cache.
- `docs/V1_PRODUCT_SPEC.md`, `docs/AI_ROUTING_POLICY.md`, `docs/SCREEN_MAP.md`.
- `autoclaw/TASKS.md` — milestone queue.
