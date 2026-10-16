# Source Registry — M7 current qualification and dated observations

Current executable entries: nine; public enabled: six; prohibited/restricted: three. M7 adds Jobicy and We Work Remotely under their official feed grants. See [M7 source expansion/compliance](M7_SOURCE_EXPANSION.md), [measured yield review](M7_SOURCE_YIELD_REVIEW.md), `qualificationFor()` and the owner Source Health view for current status. Candidate references are not executable sources.

The old 2026-10-14 observations below remain dated baseline evidence. New M7 measurements are from 2026-10-16. Neither HTTP 200 nor this historical table authorizes a new integration. Terms and deployment scope must be checked before retrieval. Verification now reuses cached responses within polling intervals and refuses an extra pass inside the production interval:

```bash
cd WORKING
npm run verify:live          # or: node tools/verify-sources.mjs
```

**The live suite is compliance aware.** It contacts only the sources whose terms
permit reading them for the current deployment scope, and it derives that set from
this registry (`planLiveProbes()` in `packages/core/src/sources/probePlan.ts`):

- sources whose terms **prohibit** automated access (Devpost, Freelancer.com) are
  **never contacted** — their adapters are verified from their recorded fixtures in
  the same run, which still proves they parse the real payload shape;
- a source restricted to personal scope (Hacker News) is contacted only when
  `LIVE_SCOPE=personal` says the deployment is single-user;
- both the endpoint **and homepage** hosts of a restricted source are refused, so a
  request to `news.ycombinator.com` fails rather than passing as "just a homepage";
- the guard fails closed: any host the plan does not explicitly allow throws, so a
  future edit that reintroduces a prohibited request fails loudly.

The plan is unit-tested **without network access**, so the rule holds in CI rather
than only when someone runs the live suite. The suite also re-checks the terms
notices it depends on (Remotive and Remote OK link-back, Arbeitnow's meta terms) on
the sources it is allowed to contact.

That suite fails if a provider changes its response shape, its terms notice or
its rate budget, so this record cannot silently go stale.

## Enabled sources (terms read, adapter implemented, serving)

| id | endpoint | probe result | terms provenance | min interval |
|----|----------|--------------|------------------|--------------|
| `jobicy` | `https://jobicy.com/api/v2/remote-jobs?count=50` | M7 production: HTTP 200, 50 rows, 40 published | Official API Fair Use permits public products/cache with attribution and canonical Jobicy link | 360 min |
| `weworkremotely` | `https://weworkremotely.com/remote-jobs.rss` | M7 production: HTTP 200, first 50 normalized, 35 published | Official RSS invitation permits feed reuse with attributed WWR links | 360 min |
| `remotive` | `https://remotive.com/api/remote-jobs` | HTTP 200, `application/json`, ~189 KB, 15–20 jobs | **Verbatim from the API payload's own `0-legal-notice` string** | 360 min |
| `remoteok` | `https://remoteok.com/api` | HTTP 200, `application/json`, ~601 KB, 100 array elements | **Verbatim from array element 0 (`legal`)** | 60 min |
| `arbeitnow` | `https://www.arbeitnow.com/api/job-board-api` | HTTP 200, `application/json`, ~2.4 MB, 300 items/page | **Verbatim from the response's `meta.terms` / `meta.info`** | 360 min (M7 low-yield operational cap) |
| `github-bounties` | `https://api.github.com/search/issues?q=label%3Abounty+state%3Aopen` | HTTP 200, 30 issues, `total_count` 4260 | Live `/rate_limit` measured: 10 search/min, 60 core/hr | 60 min |
| Service | Status | Queue policy | Scope note |
|--------|--------|--------------|------------|
| `remotive` | serving | 360 min | Their notice forbids displaying jobs behind a sign-up wall, so published listings are readable without an account |
| `remoteok` | serving | 60 min | Link-back + attribution required |
| `arbeitnow` | serving | 60 min | Free public API, link-back requested |
| `github-bounties` | serving | 60 min | Measured unauthenticated budget: 10 search/min, 60 core/hr |
| `hn-freelancer` | **serving in personal scope only** | 120 min | Public/multi-user display permission unestablished; see above |

### What Remotive's own payload says

Quoted from the live response, and encoded in `permittedUse`:

> API documentation and access is granted so that developers can share our jobs
> further. Please do not submit Remotive jobs to third Party websites, including
> but not limited to: Jooble, Neuvoo, Google Jobs, LinkedIn Jobs. Please link
> back to the URL found on Remotive AND mention Remotive as a source … Note that
> excessive requests will be blocked.

Two consequences are enforced in code, not just documented:

- **Link-back and attribution.** `requiresLinkBack: true`, `attribution: 'Remotive'`; the published record carries both fields.
- **Request budget.** "we advise max. 4 times a day" → `minIntervalMinutes: 360`. `isDueForCrawl()` is unit-tested, and `runHunt` records `skippedForInterval: true` rather than crawling early.

### What Remote OK's own payload says

Element 0 of the live response is not a job:

> Please link back (with follow, and without nofollow!) to the URL on Remote OK
> and mention Remote OK as a source, so we get traffic back from your site. If
> you do not we'll have to suspend API access. … Please don't use the Remote OK
> logo without written permission as it's a registered trademark, please DO use
> our name Remote OK though.

The adapter skips element 0 explicitly, and a test asserts that no candidate is
ever built from the legal notice. The logo is not used anywhere in the UI; the
name is used as attribution.

### What Arbeitnow's own payload says

`meta.terms`: *"This is a free public API for jobs, please do not abuse. I would
appreciate linking back to the site. By using the API, you agree to the terms of
service present on Arbeitnow.com."*
`meta.info`: *"Jobs are updated every hour … Use `?page=` to paginate."*

This is a Germany-weighted board: of 300 sampled items only **13** had
`remote: true`. `remote` is a real boolean, so on-site roles are reported as
positively on-site and rejected by the remote gate — not silently kept.

### Fields deliberately left unknown

The registry is only half the honesty story; the adapters are the other half.
Fields a provider does not publish stay `unknown`:

| Field | Remotive | Remote OK | Arbeitnow | GitHub | HN | Freelancer RSS | Devpost |
|-------|----------|-----------|-----------|--------|----|----------------|---------|
| `reward.min/max` | text-parsed | numeric (no period) | **never published** | **never published** | never | text-parsed | HTML-parsed |
| `reward.currency` | text-detected | **not published** | n/a | n/a | n/a | text-detected | symbol + span |
| `reward.basis` | only if stated | **never stated** | n/a | n/a | n/a | never | one-off |
| `remote` | **not published** | only when `location == "Remote"` | real boolean | not published | not published | not published | `location == "Online"` |
| `noCvRequired` | not published | not published | not published | not published | not published | not published | not published |

Notes that matter:

- **Remotive `salary` is free text** and is frequently the empty string. Live examples: `''`, `$35,3k- $52k` (European decimal comma), `OTE $25k - $35k`, `$50-$75 /hour`. All 8 non-empty salaries in the probe were machine-readable; an unreadable one stays `null`, never `0`.
- **Remote OK publishes bare numbers.** Both `40–48` and `145000–220000` appear in one response, so no single pay period can be assumed: `basis` stays `unknown` and `currency` stays `null` because the feed states neither.
- **GitHub publishes no payout field.** The `bounty` label is not a guarantee, so `rewardClaim: 'unverified'` is recorded and the risk model penalises unverified bounty claims. The first live page was dominated by promotional aggregator repositories rather than real bounties.

## Dormant sources (adapter implemented, switched OFF)

These adapters exist and are unit-tested against recorded payloads, but the
registry keeps them off. For these two, the compliance review found an **explicit
prohibition**, not merely unread terms. `isServable()` requires
`termsReviewed && adapterImplemented && enabled`, and a test asserts every
non-servable source is off **and** carries a `disabledReason`.

| id | probe result | why it is off | what would enable it |
|----|--------------|---------------|----------------------|
| `devpost` | HTTP 200, 9 hackathons | ToS §4 prohibits automated access to the Site "or any related data or information" | Written permission from Devpost, or published API terms |
| `freelancer-rss` | HTTP 200, `text/xml`, 20 items | User Agreement §33 requires express written permission for automated access; §4(11) bans cross-site aggregation; API T&Cs §5.3 bars storing the data **or its hash** | Express written permission covering retrieval *and* storage/display |

`runHunt` reports these in `dormant[]`. That is deliberate: "we found nothing"
must never be confused with "we did not look".

### Hacker News via Algolia — scope-restricted

This is the one source whose status changed after a **second** review, requested
when the product scope changed from "one person" to "multiple users".

**Personal deployment:** enabled. The API is published for programmatic use
("It enables developers to access HN data programmatically using a REST API") and
documents a budget ("We are limiting the number of API requests from a single IP
to 10,000 per hour").

**Public / multi-user deployment:** **dormant.** Y Combinator's Terms of Use
(HN's own footer links to them as its legal terms) restrict more than
commercial use:

> "**Except as expressly authorized by Y Combinator, you agree not to modify,
> copy, frame, scrape, rent, lease, loan, sell, distribute or create derivative
> works based on the Site or the Site Content, in whole or in part** …"
> — <https://www.ycombinator.com/legal>

The "display, distribute, license, perform, publish, reproduce …" clause is
gated on *commerciality*, but the sentence above is not, and displaying stored
copies of titles and authors to other users is squarely "distribute … the Site
Content" without the express authorisation that clause requires. Nothing in the
HN Guidelines, the HN FAQ, the official HN API README or the Algolia HN Search
documentation grants it either (the Guidelines say only "please don't automate
posting" — posting, not reading).

**Verdict: permission UNESTABLISHED for public display** — not permitted, and not
clearly prohibited either. The registry therefore keeps the adapter, keeps its
tests, and marks it `publicDeploymentAllowed: false` with the exact condition
that would lift the restriction. Nothing was removed.

**Condition to re-enable for public deployment:** express written authorisation
from Y Combinator covering redistribution or public display of HN story metadata
(a licence or terms attached to the official HN API would do), or a clause in the
HN Guidelines/FAQ addressing third-party clients. Full quoted evidence:
`docs/SOURCE_COMPLIANCE_REVIEW_HN_MULTIUSER.md`.

### How the scope is enforced

`SourceDefinition.publicDeploymentAllowed` is separate from `enabled`, and
`isServable(source, scope)` requires both. The default scope everywhere is
`public`, so a missing or misspelled environment value can never widen what is
crawled: `HUNT_DEPLOYMENT_SCOPE=personal` is the only way to enable personal-only
sources, and anything else is treated as public.

Full evidence for every source, with each verdict tied to a quoted sentence and
URL, is in `docs/SOURCE_COMPLIANCE_REVIEW.md` and
`docs/SOURCE_COMPLIANCE_REVIEW_HN_MULTIUSER.md`.

### Correction to an earlier assumption

An earlier draft of the registry claimed the Freelancer feed "frequently" had an
empty title and that the adapter had to derive one from the URL slug. The probe
disproved it: **all 20 items carried a title**, a canonical
`https://www.freelancer.com/projects/...` link, and an embedded
`(Budget: … , Jobs: …)` clause. The registry note and the adapter were corrected
to parse the real budget/skills clause instead of inventing a title.

## Adding a source

1. Probe the endpoint and record status, content type and payload size.
2. Read the provider's terms. If the provider embeds them in the response, quote that and set `termsSource` accordingly. Anything unread goes in as `unverified`.
3. Only set `enabled: true` when `termsReviewed` and `adapterImplemented` are both true, and the terms you read actually permit the use. A prohibition is a permanent `enabled: false` with a `disabledReason` quoting the clause.
4. Set `minIntervalMinutes` from the provider's own stated guidance; otherwise use a polite floor (never below 30 minutes).
5. Add a fixture via `node tools/capture-fixtures.mjs` and an adapter test.
6. Re-run `npm run verify:live`.
