# Build Receipt — M3 (Sources, Evidence and Deterministic Verification)

Date: 2026-10-14
Verdict: **M3_COMPLETE_READY_FOR_M4_ROUTING**
Baseline package: `NTK_AI_Income_Opportunity_Hunter_M1-M2_Foundation_2026-10-14.zip`
(SHA-256 `f53bbf68804f39a514db991a97334a60b53c158ea68caa5176e61d6988132a00`)

## Scope

M1/M2 were verified first, the failures found were repaired, and M3 was then
built on top: Firebase/core persistence contract, a real Source Registry with
live-verified adapters, evidence capture, eligibility, zero-capital filtering,
risk/scam rules, deduplication and deterministic scoring — tested, documented
and packaged as one handoff.

## Verifications actually run

| Command | Result |
|---------|--------|
| `npm run typecheck` (core + web + worker) | **pass** |
| `npm test` (core 174 + web 30) | **pass**, 204 tests, 7 live tests skipped by default |
| `npm run build` (web + worker) | **pass** |
| `npm run verify:live` | **pass**, 7 live checks, all 7 endpoints HTTP 200 |

Live run output (2026-10-14, real network):

```
remotive:         ok=true status=200 bytes=188598   seen=15  candidates=15  skipped=0
remoteok:         ok=true status=200 bytes=600835   seen=99  candidates=99  skipped=0
arbeitnow:        ok=true status=200 bytes=2398225  seen=300 candidates=300 skipped=0
github-bounties:  ok=true status=200 bytes=160255   seen=30  candidates=30  skipped=0
devpost:          ok=true status=200 bytes=9773     seen=9   candidates=9   skipped=0
hn-freelancer:    ok=true status=200 bytes=42004    seen=20  candidates=20  skipped=0
freelancer-rss:   ok=true status=200 bytes=72593    seen=20  candidates=20  skipped=0
github limits: search=10/min core=60/hr
remotive salaries: 8 non-empty, 8 machine-readable
```

## Failures found and repaired

### From the M1/M2 baseline

1. **Build was broken.** `workers/hunter-scheduler/tsconfig.json` was missing
   `rootDir`, so `npm run build` failed with
   `TS5011: The common source directory of 'tsconfig.json' is './src'. The 'rootDir' setting must be explicitly set`.
   *Fix:* set `"rootDir": "src"`; the worker now emits `dist/index.js`.
2. **The Firestore query could not have worked.** `opportunityRepository.ts`
   ordered by `matchScore` and filtered `noCapitalRequired`, while
   `firestore.indexes.json` declares `rankScore` and the published record stores
   `zeroCapital`. The query would have failed at runtime against the deployed
   index. *Fix:* the query is now built from an exported `PUBLISHED_QUERY`
   constant, a test asserts it matches the declared composite index, and the
   repository was rewritten to be testable through injected ports.
3. **The zero-capital engine contradicted its own documentation.** The comment
   claimed it "fails CLOSED"; the code returned `zeroCapital: true` whenever no
   cost language was found, i.e. it failed *open*. *Fix:* the two states are now
   distinct — `zeroCapital` (no cost evidence) and `costConfirmed`
   (`upfrontCostUsd: 0`, only when the source says so). Silence is carried
   through as `unknown`, never as `false` and never as a confirmed `$0`.
4. **Core package entry points did not exist.** `package.json` declared
   `main: src/index.ts` and exports for `./sources` and `./pipeline`, but no
   barrel files existed, so nothing could import the package.
   *Fix:* all barrels added, and `packages/*` was added to the root workspaces
   so `@ntk/hunter-core` links and typechecks with everything else.

### Introduced and caught during M3

5. **A dead risk rule.** `large_fee_request` scanned `findings[].evidence`
   instead of the posting text, so it could never fire on a real posting: a
   `$500 security deposit` scored as fully trusted. *Fix:* the rule now scans
   the posting text, and the payment-demand rule recognises noun forms
   (`security deposit`, `registration fee`, `activation charge`) and explicit
   amounts, not only `pay … a fee` phrasing.
6. **Non-USD prizes were dropped.** `parsePrizeAmount` produced `₹  100,000`
   after tag-stripping (double space), and the amount pattern only allowed a
   single separator, so a live Devpost INR prize parsed to `null`. *Fix:*
   whitespace is collapsed before matching and the separator is `\s*`.
7. **Provider fingerprints kept punctuation.** `Acme Ltd.` normalised to
   `acme .` while `ACME` normalised to `acme`, so the same employer produced two
   different dedupe keys across sources. *Fix:* residual punctuation is stripped
   after legal-suffix removal.
8. **A registry endpoint that returned 422.**
   `https://api.github.com/search/issues` without a `q` parameter answers
   **HTTP 422**. The live suite caught it. *Fix:* the registered endpoint now
   carries the qualified query the adapter actually issues.
9. **Core broke the web project's typecheck.** The `node:crypto` fallback in
   `sha256Hex` required Node types inside the browser-typed app. *Fix:* the Node
   specifier is built at runtime so the fallback stays available without forcing
   Node's type definitions on browser consumers.
10. **The UI presented placeholder data as verified evidence.** The seed rows
    carried `sourceUrl: https://example.com/...` and evidence lines that read as
    captures. *Fix:* every bundled row is now marked `demoSeed: true`, links to
    `example.invalid`, says "Demo placeholder — not a real capture", and the
    shell labels demo rows. Hard-coded dashboard statistics ("24 new",
    "$1,250 tracked earnings") were replaced with values derived from the data
    in hand, and an "—" where there is genuinely no data.

## What M3 delivers

### `packages/core` — `@ntk/hunter-core` (dependency-free, strict TypeScript)

- **Source Registry** — 7 real feeds with verified endpoints, quoted
  `permittedUse` text and its provenance (`termsSource`), `verifiedAt`,
  `requiresLinkBack`, per-source `minIntervalMinutes`, and a `dormant` set that
  documents why a source is off. See `docs/SOURCE_REGISTRY.md`.
- **Adapters** — one per feed, all injectable (`fetch` + clock), all conservative:
  `remotive`, `remoteok`, `arbeitnow`, `github-bounties` (live),
  `devpost`, `hn-freelancer`, `freelancer-rss` (implemented, dormant).
- **Evidence** — SHA-256 snapshot hashes over the exact fetched bytes, bounded
  excerpts, `structured-field` / `text-pattern` / `absent` assertions, and an
  `unknownFieldCount` that drives confidence instead of hiding gaps.
- **Reward parsing** — handles the real provider formats (`$35,3k- $52k`,
  `OTE $25k - $35k`, `$50-$75 /hour`, `Budget: €100 - €1000 EUR`,
  `$<span data-currency-value>138,000</span>`, `₹ …`), always keeps the verbatim
  string, and never treats an unreadable amount as zero. No FX conversion is ever
  invented: a non-USD amount is unscored rather than converted at a made-up rate.
- **Zero-capital filtering** — blocking cost patterns with negation handling,
  separating "no cost evidence" from "confirmed $0".
- **Eligibility** — tri-state checks where only a *positively failed* blocking
  check rejects, and `unknown` is reported as missing evidence rather than as
  ineligibility. Region-only statements stay unknown; a bare city yields no
  country rather than an inferred one.
- **Risk / scam rules** — 15 deterministic rules plus earned bonuses: up-front
  payment demands (three phrasings), wallet secrets, guaranteed-income language,
  off-platform contact, free-email-only contact, implausible pay, unpaid trials,
  stale listings, prize-vs-salary, unsupported high value. Critical findings set
  `blocked`, which withholds the candidate before any model sees it.
- **Deduplication** — same-source re-crawl, normalised provider+title
  fingerprint, Jaccard near-match, and a deterministic `preferCanonical`.
- **Deterministic scoring** — 10 weighted components summing to exactly 1,
  explained per component, with the risk deficit deducted from the final rank
  and trust reported separately. `runHunt` takes an injected clock and `fetch`,
  and a test asserts two identical runs are byte-identical.
- **Persistence contract** — `toFirestoreOpportunityDoc`,
  `toFirestoreEvidenceDoc`, `toFirestoreRunDoc` plus
  `validateFirestoreDocument`, which rejects reserved field-name characters,
  `undefined` values that `JSON.stringify` hides, and oversized documents.

### `apps/web`

- Views the published contract directly: `mapPublishedOpportunity` produces the
  UI model from `PublishedOpportunity` + the evidence document, so a storage
  change cannot silently change the screens.
- Offline-first `HybridOpportunityRepository` (live → cache → error) with
  injected ports, plus `offline.ts` v2 adding an evidence-summary store.
- Tri-state fields survive to the UI: the shell renders "Remote unknown" and
  "CV requirement unstated" instead of a false negative.

## Known limitations (not claimed as done)

- **No live Firebase project.** Auth, rules and indexes are unverified against a
  real project; `firestore.rules` and `firestore.indexes.json` exist but have
  never been deployed. Live auth/onboarding remains the open M2 item.
- **No Hunter API service.** The cron worker POSTs to `HUNTER_API_URL`, which
  does not exist yet; nothing writes to Firestore from a server. The document
  contract and validator are ready for it, but no end-to-end write is proven.
- **Real yield is unmeasured.** The pipeline correctly rejects on-site Arbeitnow
  roles and everything without a stated reward, and the live Remotive/GitHub
  feeds carry many listings that fail the gates. No production run has shown how
  many opportunities per day survive to `published`.
- **Three sources are dormant** pending a terms read (devpost, hn-freelancer,
  freelancer-rss), so ~60 of the 493 live items are not yet publishable.
- **The risk rules are pattern-based.** They will miss novel scams and can
  false-positive on unusual phrasing; every finding names its evidence so a
  human can overrule it.
- **`workers/hunter-scheduler/src/index.ts` was not modified** despite a planned
  comment/`intervalPolicy` improvement: the write was refused by the workspace
  safety guard twice as a false positive on the `HUNTER_SHARED_SECRET: string`
  env binding. Per-source intervals are enforced and tested in core regardless,
  so this is cosmetic; the file is byte-identical to the M1/M2 package.
- **Screenshots/render QA for the new states were not re-run**; the M1 renders
  predate the UI field changes (tri-state badges, demo labelling).

## Next milestone — M4

1. Build the Hunter API service that hosts `runHunt` and writes the documents
   (Admin SDK), then prove one end-to-end write into Firestore.
2. Connect a real Firebase project: deploy rules/indexes, complete auth +
   onboarding persistence.
3. FlagshipRouter capability API integration (free-first routing).
4. Read the terms for the three dormant sources and enable them one at a time.
5. Re-run mobile/tablet/desktop/offline acceptance with the new tri-state UI.
