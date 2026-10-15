# Build Receipt — M5b (Compliance-Aware Verification, Owner Gates, Partial Browser Acceptance)

Date: 2026-10-15
Baseline: `ARCHIVE/NTK_AI_Income_Opportunity_Hunter_M5_2026-10-15.zip`
(SHA-256 `783b8e9b481e42c89ba20e84fe42ffb8471b66707ade0c8be3322485e393c41c`)

## Verdict

**`M5b_PARTIAL — COMPLIANCE DEFECT FIXED AND VERIFIED, BROWSER RENDER ACHIEVED; LIVE DEPLOYMENT BLOCKED BY OWNER-ONLY STEPS`**

The target `M5b_LIVE_DEPLOYMENT_AND_ACCEPTANCE_VERIFIED` was **not** reached. Two
of its gates now have real progress; the rest need owner-authenticated accounts
that do not exist in this environment, and one needs an answer only the owner can
give. Nothing is claimed that was not performed.

| M5b gate | Status |
|----------|--------|
| 1. Verify M5 from the canonical package | **PASSED** |
| 2. Compliance-aware live verification | **FIXED AND VERIFIED** |
| 3. Firebase live project | **BLOCKED — needs owner approval of which project** |
| 4. Render deployment | **BLOCKED — no Render account or API token present** |
| 5. One real hunt | **BLOCKED** — depends on 3 and 4 |
| 6. Cloudflare deployment | **BLOCKED** — no wrangler authentication present |
| 7. Browser/PWA acceptance | **PARTIAL** — one viewport, one route, view-only |
| 8. Notification smoke test | **BLOCKED — no Telegram token present** |
| 9. AI | Deterministic hunter runs without it; no endpoint available (recorded as an external gate) |

## 1. M5 re-verification (clean extraction of the M5 package)

| Check | Result |
|-------|--------|
| Extract | 170 files |
| `npm install` | pass, 339 packages |
| `npm run typecheck` | exit 0 |
| `npm test` | exit 0 — core **301 passed** (+7 skipped), web **63**, api **70** (+20 skipped) |
| `npm run build` | exit 0 — four artifacts |
| `npm run verify:emulator` | **pass — 20/20** (5 pipeline integration + 15 security rules) |

No regressions. Every existing test was preserved.

## 2. The compliance defect — found, fixed, verified

**The defect was in my own tooling, and it was real.** `verify:live` probed
*every* registered endpoint, including **Devpost and Freelancer.com, whose terms
prohibit automated access**, and Hacker News, which is personal-scope only. A test
suite is not exempt from the terms the product claims to respect, so the previous
suite was itself the misconduct the compliance review warns about.

**The fix is structural, not a hardcoded skip list.** New
`packages/core/src/sources/probePlan.ts` derives what may be contacted from the
registry:

- `planLiveProbes({ sources, scope })` returns `probe` (permitted), `offlineOnly`
  (each with the registry's own reason) and `forbiddenHosts`.
- **Prohibited and out-of-scope sources are never contacted**; their adapters are
  verified from their **recorded fixtures** in the same run, which still proves
  they parse the real payload shape.
- Both the **endpoint and the homepage** hosts are forbidden for a prohibited
  source — fetching `news.ycombinator.com` HTML is the "scrape the Site" conduct
  the terms describe, not merely an API call.
- `assertProbeAllowed(url, plan)` wraps `fetch` in the live suite, and it **fails
  closed**: any host the plan does not explicitly allow throws. A future edit that
  reintroduces a prohibited request fails loudly instead of quietly.
- Scope is explicit: `LIVE_SCOPE=public` (default, stricter) or `personal`.

### Verified behaviour (live run, public scope)

```
PROBE    arbeitnow (https://www.arbeitnow.com/api/job-board-api)
PROBE    github-bounties (https://api.github.com/search/issues?q=label%3Abounty+state%3Aopen)
PROBE    remoteok (https://remoteok.com/api)
PROBE    remotive (https://remotive.com/api/remote-jobs)
OFFLINE  devpost — Devpost Terms of Service §4 prohibits automated access …
OFFLINE  freelancer-rss — User Agreement §33 … API T&Cs §5.3 bars storing the data …
OFFLINE  hn-freelancer — Express written authorisation from Y Combinator … is required
never contacted: devpost.com, hn.algolia.com, news.ycombinator.com, www.freelancer.com
```

Live results for the permitted sources, and offline fixture results for the rest:

```
remotive:        ok=true status=200 bytes=188598  seen=15  candidates=15
remoteok:        ok=true status=200 bytes=595560  seen=99  candidates=99
arbeitnow:       ok=true status=200 bytes=3089027 seen=300 candidates=300
github-bounties: ok=true status=200 bytes=153377  seen=30  candidates=30
devpost:          verified offline from devpost.json
freelancer-rss:   verified offline from freelancer-rss.xml
hn-freelancer:    verified offline from hn-freelancer.json
```

18 new unit tests (`test/probePlan.test.ts`) pin the policy **without network
access**, so "never contact a prohibited source" holds in CI, not only when
someone remembers to run the live suite. Core test count rose from 301 to **319**.

## 3. What was found about the owner gates (read-only reconnaissance)

**Firebase CLI is authenticated** as `trotipac@gmail.com`. Two projects are
visible, and both already have a Firestore `(default)` database in STANDARD
edition / FIRESTORE_NATIVE:

| Project ID | Display name |
|------------|--------------|
| `ntk-income-radar` | NTK Income Radar |
| `ntk-api-tester` | NTK API Tester |

**I did not deploy to either.** Deploying rules and indexes changes the owner's
real cloud project, and picking between two projects by name inference is not a
decision I should invent — the brief says "owner-approved" project. The question
was asked; no answer was given, so nothing was touched.

`gcloud` is **not installed**, so a service-account key cannot be minted
non-interactively: it must be created in the Firebase console.

Not present: Render account/API key, Cloudflare credentials (`~/.wrangler`
missing), Telegram bot token, `FLAGSHIP_ROUTER_URL`.

## 4. Browser/PWA acceptance — real, but partial

The browser pane was available this turn, which allowed a genuine render for the
first time. Because the pane refuses `http://localhost`, a relative-path build was
opened as a workspace file.

**Proven by the render:** the app boots and renders; the mobile layout at ~425×591
is intact with no clipping; every card shows **"No upfront cost found — verify
before proceeding"** (the M5 wording, not "$0 capital"); the **"Confirmed $0 only"**
filter chip exists and is off by default; demo rows are visibly marked "DEMO ROW"
and "Demo data"; cards show "96 % rank"; rewards render with their basis.

**Not proven:** tablet and desktop widths (fixed viewport, no resize control),
routes beyond the first two navigations (`browser_workspace_file_denied` refused
further interaction), install prompt, service worker, IndexedDB across reloads,
and the offline/online → reconnect cycle. Full detail, including what each missing
item would require, is in `docs/PWA_ACCEPTANCE_REPORT.md`.

## 5. Owner gates — exact steps

Precise, copy-pasteable instructions are in `docs/LIVE_DEPLOYMENT_RECEIPT.md`,
including which project to name, the console-only service-account step, the Render
build/start/health configuration and the Cloudflare secret storage. In short:

1. **Name the Firebase project** to use (`ntk-income-radar` is the obvious
   candidate by name; `ntk-api-tester` looks unrelated).
2. **Create the service-account JSON** in the Firebase console (Project settings →
   Service accounts). It cannot be minted from here: `gcloud` is absent.
3. **Deploy the Hunter API to Render** (free plan) with that JSON as a Secret File
   and `HUNTER_SHARED_SECRET` set.
4. **Authenticate wrangler** (or supply a Cloudflare API token) to deploy the
   scheduler and its cron trigger.
5. **Supply a Telegram bot token** for the one notification smoke test.

Each of these is a single owner action, and the repository is configured so that
everything after it is mechanical.

## 6. Blocked writes (reported, not worked around)

Two files could not be updated this milestone, and the reason is a conflict between
two of your own requirements rather than a code problem:

- `WORKING/docs/LIVE_DEPLOYMENT_RECEIPT.md`
- `HANDOFF_TO_CHATGPT/REVIEW_HANDOFF.md`

Both contain the secret-inventory section that the **universal NTK handoff rule**
mandates, whose first line is literally the label followed by the word
"REQUIRED". The workspace write guard reads that label as a credential assignment
and refuses any write to a file containing it — the scan covers the whole
resulting file, so the files are effectively frozen.

**What was not done about it:** the label was not renamed, abbreviated or
sneaked past the guard. The instruction on a flagged write is to tell the owner
and let them decide, and that is what this section is.

**Impact:** the M5-era content of those two files remains accurate about secret
status (every entry is still NOT CONFIGURED) but does not mention the newly
discovered fact that the **Firebase CLI is authenticated** and two projects are
visible. That finding is recorded above, in `docs/BUILD_RECEIPT_M5B.md`, and in
`HANDOFF_TO_CHATGPT/M5B_HANDOFF_STATE.md`.

**Resolution options for the owner:** allow edits to those two files this once, or
approve an equivalent label that does not trip the guard, or move the
secret-inventory section into its own file that is written once and left alone.

## 7. Free-tier position

Unchanged: Firebase Spark only (nothing enabled — I did not touch any project),
free Render only, free Cloudflare only, no paid API, `PAID_AI_AUTHORIZED=false`
everywhere. No cost was incurred and none can be incurred by the code as it
stands.

## 8. Verification summary for this milestone
| Command | Result |
|---------|--------|
| `npm run typecheck` | exit 0 (core, web, worker, api) |
| `npm test` | exit 0 — core 319, web 63, api 70 (**452 passed**, 28 skipped) |
| `npm run build` | exit 0 — four artifacts |
| `npm run verify:live` | **pass — 8 checks; 4 permitted sources probed, 3 verified offline, 0 prohibited sources contacted** |
| `npm run verify:emulator` | **pass — 20/20** |

## 9. What is still not true

- No live Firebase project was deployed to, no Render service exists, no
  Cloudflare Worker is deployed, no real hunt has run, no notification has been
  sent, and no AI provider has been contacted.
- Browser acceptance is one viewport of one route, view-only.
- Production yield remains unmeasured.

Next: the owner answers the four steps above, then M5c proves the live pipeline end
to end — which is the only thing between this state and a working product.
