# Build Receipt — M5 (Live Pipeline Readiness, Scope Correction, Notifications and Lifecycle)

Date: 2026-10-15
Baseline: `ARCHIVE/NTK_AI_Income_Opportunity_Hunter_M4_2026-10-14.zip`
(SHA-256 `0e8a2fbac49ab5b04a32939abcd24bfd7780462db1f6d5fc734d8b3563c263cc`)

## Verdict

**`M5_PARTIAL — SOURCE-SCOPE CORRECTION, SECURITY RULES AND LIFECYCLE VERIFIED; LIVE DEPLOYMENT AND BROWSER ACCEPTANCE BLOCKED BY OWNER CREDENTIALS`**

The target verdict `M5_LIVE_PIPELINE_AND_PWA_ACCEPTANCE_VERIFIED` was **not**
reached, and is not claimed. Three of its acceptance gates require resources that
do not exist in this environment: a Firebase project with owner credentials, a
Render account/API key, and Cloudflare account credentials. The M5 brief
anticipates exactly this and asks for the narrower verdict, reported honestly —
which is what this document does, section by section.

| Gate | Status |
|------|--------|
| M4 re-verification from clean extraction | **PASSED** |
| Source-scope correction (HN for multi-user) | **DONE and tested** |
| Security rules: behavioural tests | **PASSED** (15 assertions, emulator) |
| Firestore emulator pipeline integration | **PASSED** (5 tests) |
| Notifications layer (policy + channels) | **BUILT and tested; not delivered** (no provider credentials) |
| Application/outcome lifecycle | **BUILT and tested** |
| Live Firebase project (Spark) | **NOT DONE — owner credential required** |
| Render deployment | **NOT DONE — owner account required** |
| Cloudflare Worker deployment | **NOT DONE — owner account required** |
| Real FlagshipRouter connection | **NOT DONE — endpoint not available** |
| Browser/PWA/offline acceptance | **NOT DONE — browser pane cannot attach** |

## 1. M4 re-verification (clean extraction of the M4 package)

| Check | Result |
|-------|--------|
| `npm install` | pass (338 packages) |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0 |
| `npm run build` | exit 0 (four artifacts) |
| `npm run verify:live` | **pass** — 7/7 endpoints HTTP 200 |
| `npm run verify:emulator` | **pass** — 5/5 |

The emulator suite initially reported 2 failures; investigation showed this was a
**port collision** with a concurrently running emulator from the current working
tree, not a regression in the M4 package. Re-run in isolation: **5/5 passed**.
Recorded here because the first result was wrong and the correction matters.

## 2. Source-scope correction

The product is intended for multiple users, so the earlier personal-use verdict
for Hacker News was re-reviewed from primary sources.

**Result: permission UNESTABLISHED for public multi-user display.** The decisive
text is YC's Terms of Use (which HN's own footer links as its legal terms):

> "**Except as expressly authorized by Y Combinator, you agree not to modify,
> copy, frame, scrape, rent, lease, loan, sell, distribute or create derivative
> works based on the Site or the Site Content, in whole or in part** …"

The `display/distribute/publish` clause IS gated on commerciality, but the clause
above is **not**, and no examined document — HN Guidelines, HN FAQ, the official
HN API README, or the Algolia HN Search documentation — grants the express
authorisation it requires. The HN Guidelines mention automation only for
*posting* ("please don't automate posting").

**What changed in code, not prose:**

- `SourceDefinition` gained `publicDeploymentAllowed` and `publicDeploymentGate`,
  separate from `enabled`, because "may I read this?" and "may I show this to
  other people?" are different questions.
- `isServable(source, scope)` requires both; the default scope is **public**, so
  a missing or misspelled environment value cannot widen what is crawled.
- `planCrawl` and `runHunt` take the scope; `dormant[]` now reports the reason
  *for that scope*, and the registry test asserts every public-scope-restricted
  source names the condition that would lift the restriction.
- The adapter and all its tests are **preserved**. Nothing was deleted.
- `remotive` needed the same treatment in reverse: its notice states that
  "displaying our jobs in order to collect signups/email addresses to show a
  listing constitutes a breach". Gating listings behind an account is exactly
  that pattern, so **published opportunities are now publicly readable** in
  `firestore.rules` (browse first, sign in to save and apply). That satisfies the
  provider's stated requirement and is the better product.

## 3. Security rules — behavioural verification

`services/hunter-api/test/securityRules.test.ts` runs the **official**
`@firebase/rules-unit-testing` harness against the emulator, so these are real
rule evaluations with real emulated auth contexts, not a reading of the rules
file:

- anonymous read of a published opportunity → allowed; an unpublished one → denied;
- client write to `opportunities` → denied, signed in or not;
- a client write attempting to set `capitalStatus: 'confirmed_free'` → **denied**
  (a browser cannot upgrade a record to a stronger cost claim);
- evidence read requires sign-in; evidence write always denied;
- `internalSourceRuns` → invisible and unwritable for every client;
- a user can read/write their own profile, applications, sync queue, and
  **cannot** read or write another user's profile, applications, earnings, or
  notifications;
- clients cannot create notifications (server-only);
- after every denied attempt, the seeded documents are unchanged and no forged
  document exists.

**15 assertions, all passing.** This closes the security claims M5 asked to be
tested rather than asserted.

## 4. New code in this milestone

**Notifications** (`packages/core/src/notifications/`):

- `policy.ts` decides cadence: high-value/trustworthy, imminent deadline, or
  strong direct-pay → immediate; everything else → digest; nothing → null. An
  **expired deadline is disqualifying before the score checks**, so a high score
  cannot push a closed opportunity (a bug my own test caught). A capital-required
  or critical-risk record is never pushed.
- `channels.ts` composes bounded messages and provider-neutral requests for
  push/Telegram/email, reusing the shared cost wording so a notification cannot
  make a stronger claim than the app. `findForbiddenContent` scans every composed
  message for tokens, private-key blocks, service-account fields and raw payloads.

**Application/outcome lifecycle** (`packages/core/src/applications/`):

- The full `discovered → … → paid | rejected | expired` machine with a tested
  transition table (no state skipping, terminal states are not rewritten).
- Payments require a positive amount **and** a valid date supplied by the user;
  a paid application cannot later be marked rejected; `summariseEarnings` keeps
  actuals separate from expectations and reports `hasRecordedIncome` so the UI can
  say "no income recorded yet" instead of a misleading `0`.

**Deployment scope** (`services/hunter-api/src/deploymentScope.ts`) plus wiring in
the run service, `/ready` and `/internal/status`.

## 5. What is NOT done — and why

- **No live Firebase project.** No credentials exist here
  (`GOOGLE_APPLICATION_CREDENTIALS` unset, no service-account JSON in the
  workspace). Rules, indexes and the emulator are not a deployment. Every
  Firestore claim in this receipt is emulator evidence.
- **No Render deployment.** No Render account or API key was available. The
  service builds and runs locally; the documented build/start/health commands are
  in `services/hunter-api/README.md`.
- **No Cloudflare deployment,** and `workers/hunter-scheduler/src/index.ts` is
  still byte-identical to M4: writes to it remain blocked by the workspace
  safety guard (false positive on the env binding). The exact patch is in
  `docs/WORKER_WIRING_PATCH.md`.
- **No notification delivery.** No FCM, Telegram or email credentials. The
  policy and request builders are tested; **zero notifications were sent**.
- **No real FlagshipRouter call.** The router is exercised with injected model
  candidates only.
- **No browser/PWA acceptance.** The browser pane refuses `localhost` and could
  not attach to a workspace file URL in this environment, so mobile/tablet/desktop
  renders, install prompt, and the online→offline→reconnect cycle were **not**
  exercised. See `docs/PWA_ACCEPTANCE_REPORT.md` for what exists instead.
- **No live hunt.** The pipeline has never run against live providers writing to
  a live database; the closest proof is the emulator suite plus the live adapter
  verification (7/7 endpoints).

## 6. Owner gates, in the order that unblocks the most

1. **Firebase project (Spark)** — create it, deploy `firestore.rules` and
   `firestore.indexes.json`, enable Auth, and provide a service-account JSON to
   Render as a Secret File. Then one live hunt can be proven.
2. **Render web service** — free plan, build/start commands and `/health` path as
   documented. Set `HUNTER_SHARED_SECRET`, `FIREBASE_PROJECT_ID`,
   `GOOGLE_APPLICATION_CREDENTIALS`, `PAID_AI_AUTHORIZED=false`,
   `HUNT_DEPLOYMENT_SCOPE=public`.
3. **Cloudflare Worker** — deploy with `HUNTER_API_URL`, the shared secret as a
   Worker secret, `DEFAULT_REGION_PRIORITY`; apply the wiring patch.
4. **Browser acceptance** — needs a machine where the browser pane can attach.
5. **FlagshipRouter** — connect when a real endpoint exists; AI stays optional.

## 7. Free-tier guardrails

No paid capability was enabled. No Blaze plan, no paid API, no paid Render
service, no Cloud Functions. `PAID_AI_AUTHORIZED` defaults to `false` and is
never set to true anywhere in this repository. Any step that would incur cost was
stopped and recorded as a gate rather than executed.

## 8. Verification summary for this milestone

| Command | Result |
|---------|--------|
| `npm run typecheck` | exit 0 (core, web, worker, api) |
| `npm test` | exit 0 — **core 301, web 63, api 70** |
| `npm run build` | exit 0 — four artifacts |
| `npm run verify:live` | pass — 7 provider checks |
| `npm run verify:emulator` | pass — **20 tests** (5 pipeline + 15 rules) |

Next milestone: M5b — deploy and prove one live hunt end to end, then run browser
acceptance and notification smoke tests against the deployed PWA.
