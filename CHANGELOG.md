# Changelog

All milestones are cumulative; each package is a strict superset of the one it
replaces. Verdicts are recorded exactly as verified, including the narrow ones.

## M5b — 2026-10-15 — Verdict: `M5b_PARTIAL`

Baseline: M5 package `783b8e9b481e42c89ba20e84fe42ffb8471b66707ade0c8be3322485e393c41c`.

### Fixed — a real compliance defect in this project's own tooling
- **The live verification suite was contacting prohibited sources.** `verify:live`
  probed every registered endpoint, including Devpost and Freelancer.com (whose
  terms prohibit automated access) and Hacker News (personal scope only). A test
  suite is not exempt from the terms the product claims to respect.
- New `packages/core/src/sources/probePlan.ts` derives what may be contacted from
  the registry, so the list cannot drift from the compliance record:
  `planLiveProbes()`, `assertProbeAllowed()` (fails closed on any host the plan
does not permit), `isProbeAllowed()`, `describePlan()`.
- Prohibited and out-of-scope sources are now verified from their **recorded
  fixtures**; both the endpoint **and homepage** hosts are forbidden for a
  prohibited source, because fetching `news.ycombinator.com` HTML is the
  "scrape the Site" conduct the terms describe.
- `LIVE_SCOPE=public|personal` selects the scope; the default is `public`.
- 18 new tests pin the policy **without network access**, so the rule holds in CI.

### Added
- Browser render check of the built PWA (relative-path build opened as a
  workspace file). First real browser evidence in this project: mobile viewport,
  the cost wording on every card, the new filter chips, demo-row labelling, and
  the bottom navigation all confirmed on screen. Full detail and explicit gaps in
  `docs/PWA_ACCEPTANCE_REPORT.md`.
- `docs/BUILD_RECEIPT_M5B.md`.

### Changed
- `tools/verify-sources.mjs` and `tools/verify-firebase-emulator.mjs` report the
  deployment scope and skip forbidden sources by construction.

### Verified
- M5 re-verified from a clean extraction: install, typecheck, tests (core 301 +
  web 63 + api 70), build, emulator 20/20 — no regressions.
- After the fix: **core 319 passed**, live suite **8/8** with 4 sources probed,
  3 verified offline and **0 prohibited sources contacted**.

### Not done (owner-only steps, or environment limits)
- No Firebase project touched: the CLI is authenticated and two projects are
  visible, but the brief requires an owner-approved project and no project was
  named, so deploying would have been an invented preference.
- No Render deployment (no account/API key), no Cloudflare deployment (no
  wrangler auth), no notification sent (no token), no AI provider contacted.
- Browser acceptance remains partial: one viewport, one route, view-only.
- Two files are frozen by the workspace write guard because they contain the
  mandated secret-inventory label; reported in `docs/BUILD_RECEIPT_M5B.md` §9.

## M5 — 2026-10-15 — Verdict: `M5_PARTIAL`

Baseline: M4 package `0e8a2fbac49ab5b04a32939abcd24bfd7780462db1f6d5fc734d8b3563c263cc`.

### Added
- **Deployment scope** (`personal` | `public`) as a first-class registry concept:
  `publicDeploymentAllowed` and `publicDeploymentGate` on every source,
  `isServable(source, scope)`, scope-aware `planCrawl`, `runHunt` and
  `dormant[]`, plus `HUNT_DEPLOYMENT_SCOPE` (defaults to the stricter `public`).
- **Notifications layer** (`packages/core/src/notifications/`): urgency policy with
  digest fallback, bounded message composition reusing the shared cost wording,
  provider-neutral Telegram/email/push request builders, and a
  `findForbiddenContent` guard.
- **Application/outcome lifecycle** (`packages/core/src/applications/`): the full
  discovered→paid state machine, payment recording that cannot be invented,
  earnings summary separating actuals from expectations.
- **Security rules tests** using the official `@firebase/rules-unit-testing`
  harness (15 behavioural assertions against the emulator, with emulated auth).
- `docs/BUILD_RECEIPT_M5.md`, `docs/LIVE_DEPLOYMENT_RECEIPT.md`,
  `docs/PWA_ACCEPTANCE_REPORT.md`, `docs/NOTIFICATION_RECEIPT.md`,
  `docs/SOURCE_COMPLIANCE_REVIEW_HN_MULTIUSER.md`.

### Changed
- **Hacker News source is dormant for public deployments.** A second review
  scoped to multi-user use found permission *unestablished*: YC's Terms of Use
  forbid distributing Site Content "except as expressly authorized by
  Y Combinator", without the commerciality qualifier that the display clause
  carries. The adapter and its tests are preserved; the exact re-enable condition
  is recorded in the registry.
- **Published opportunities are now publicly readable.** Remotive's notice states
  that displaying its jobs behind a sign-up wall breaches their terms, so the
  listing itself is no longer gated; evidence, saved items and everything
  user-owned still require sign-in.
- `firestore.rules` gained an explicit deny for the run-audit collection.
- API `/ready` and `/internal/status` now report the deployment scope.

### Fixed
- Notification policy: an expired deadline is disqualifying **before** the score
  rules, so a high-scoring closed listing can no longer be pushed.
- Payment recording returned an unclear error for a missing amount; each refusal
  now says exactly what is missing.
- Emulator suites were interfering through shared emulator state (count-based
  assertions and parallel rule swapping). They now run serially and count only
  documents the pipeline wrote.

### Verified
- `npm run typecheck` / `npm test` / `npm run build`: all exit 0.
- Tests: **434 passed, 27 skipped** (core 301+7, web 63, api 70+20).
- `npm run verify:live`: pass — 7/7 provider endpoints HTTP 200.
- `npm run verify:emulator`: pass — 20 tests (5 pipeline integration, 15 rules).

### Not done (owner gates, unchanged by this milestone)
- No live Firebase project, no Render deployment, no Cloudflare deployment, no
  real FlagshipRouter connection, no notification delivered, no browser/PWA
  acceptance. See `docs/LIVE_DEPLOYMENT_RECEIPT.md` and
  `docs/PWA_ACCEPTANCE_REPORT.md`.

## M4 — 2026-10-14 — Verdict: `M4_HUNTER_API_AND_AI_INTEGRATION_VERIFIED`
- Hunter API service (health/ready, authenticated triggers, status, single-flight,
  interval-aware), Firestore server writer with validated idempotent writes,
  emulator integration proof, profile contract and persistence, FlagshipRouter
  capability routing with analysis safety, pinned dependencies, Node runtime.
- Fixed: `internal/sourceRuns/{id}` was not an addressable Firestore path; the
  in-memory store was an append log; an unnormalisable market silently defaulted.

## M3 — 2026-10-14 — Verdict: `M3_COMPLETE_READY_FOR_M4_ROUTING`
- Source registry with quoted terms provenance, 7 adapters, evidence capture,
  eligibility, zero-capital filtering, risk rules, deduplication, deterministic
  scoring, Firestore document contract.
- Fixed: worker build break (`tsconfig` `rootDir`), a Firestore query/index
  mismatch that could never have worked, a zero-capital engine that contradicted
  its own documentation, and missing core entry points.

## M1/M2 — 2026-10-14 — Verdict: `M2_FOUNDATION_READY_FOR_FIREBASE_CONNECT`
- Responsive PWA shell, offline cache and service worker, Cloudflare scheduler
  foundation, Firebase config adapter, Firestore rules and indexes, AI routing
  policy, no-dependency visual prototype.
