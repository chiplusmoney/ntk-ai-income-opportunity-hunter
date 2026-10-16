# M7 source expansion and compliance

Reviewed in BrowserOS Neo, chiplusmoney, 2026-10-16. The operational deployment is public/multiuser. Public endpoint availability is never treated as permission.

## Qualified additions

| Source | Retrieval/storage/display grant | Conditions | Scope and coverage |
| --- | --- | --- | --- |
| Jobicy | [Official developer resource](https://jobicy.com/jobs-rss-feed) and [provider-owned Fair Use](https://github.com/Jobicy/remote-jobs-api#fair-use) permit products, websites, job boards, automation, caching and summaries. Read with [general terms](https://jobicy.com/terms-and-conditions). The specific API permission governs the listing integration; no website/design/logo copying. | Attribute Jobicy and preserve canonical Jobicy listing URL; no misleading reposts or spam. Minimum one hour between synchronization passes. Hunter: one public page, 50 rows, every six hours. No Commercial API key/wallet or paid ATS links. | Remote jobs/contracts, writing, design and AI roles when listed; global/US/GB/CA and other explicit locations. Salary optional, deadline absent. |
| We Work Remotely | [Official feed invitation](https://weworkremotely.com/remote-job-rss-feed) permits anyone to use openings to fill a remote job feed, with attributed links. [General terms](https://weworkremotely.com/terms-and-conditions) read; no separate prohibition overriding the published RSS invitation located. [Robots](https://weworkremotely.com/robots.txt) allows the feed. | RSS only, link back to WWR, no profiles/images/site scraping. No numerical limit published: conservative one request every six hours, normalize at most 50 rows. Store listing facts and bounded internal evidence for this authorized feed display. | Remote jobs/contracts, software, support, writing/design and AI tasks. Explicit region controls eligibility; headquarters never does. Salary prose stays unknown to avoid confusing benefits/revenue with pay. |

Live probes made only after these specific grants were read. Jobicy returned 50 rows; WWR feed contained 87 at the initial review, with normalization limited to 50. These are dated observations, not production yield totals.

Before M7: four public sources. After qualification: six public sources (two additions). This is fewer than the preferred 6–12 additions because no permission gap was filled with assumptions. Category feeds on one provider are not counted as independent sources.

## Disabled/researched candidates

| Source/category | Actual review and verdict | Exact enabling condition |
| --- | --- | --- |
| Himalayas / jobs | Read [API docs](https://himalayas.app/api) and [current terms §113(c)](https://himalayas.app/terms#api). Docs invite discovery integrations, but terms prohibit redistribution to aggregators. RESTRICTED; no jobs endpoint contacted. | Written authorization covering Hunter aggregation/storage/display, or revised unambiguous API terms. |
| Prolific / paid research | [Official docs](https://docs.prolific.com/) describe researcher study creation/recruitment. Not a grant to retrieve participant jobs. NOT QUALIFIED; no study endpoint contacted. | An official participant opportunity feed and permission for automated retrieval, evidence storage and public display. |
| Outlier / AI evaluation | [Terms](https://outlier.ai/legal/terms-of-use) read. No public opportunity-feed grant established. NOT QUALIFIED; no listings endpoint contacted. | Official feed and explicit retrieval/storage/display permission. |
| HackerOne / security bounties | [API docs](https://api.hackerone.com/) describe own-program reports/settings and bounty awards. No public aggregation grant established. NOT QUALIFIED. | Program listing redistribution rights, credential scope where needed, and responsible testing restrictions established. |
| Grants.gov / grants | [API entry page](https://www.grants.gov/api) identifies integration-specific terms and API guide. Qualification incomplete, no feed retrieved. NOT QUALIFIED. | Complete terms/storage/display review plus individual eligibility and competitive/noncompetitive classification. |
| Findwork / development | [Developer page](https://findwork.dev/developers/) redirected to sign-in. Pricing/rights unverified. PAID_SOURCE_CANDIDATE — NOT ENABLED; this label is a budget-review hold, not a verified current price. | Verified permanent free access and storage/display permission, or separately authorized budget. No subscription made. |
| USAJOBS / federal jobs | Candidate reference only; not reviewed or probed. | Authorized free API credential plus API terms, storage and public-display review. |
| Superteam / Web3 | Candidate reference only; not reviewed or probed. | Official feed permission plus jurisdiction, noncustodial/no-capital review. |

Devpost/Freelancer remain prohibited; HN remains restricted to personal scope. Their listing endpoints are never included in public live verification. Existing four grants are retained from accepted M6; operational metadata never upgrades their permission.

## Registry and onboarding standard

The executable registry and `qualificationFor()` provide identity, endpoint, implementation/enable state, public scope, references, reviewed date, storage/display conditions, attribution, rate floor, geography/category/data availability and enabling conditions. Runtime Source Health adds actual last success/crawl, response, yield and next due. Candidates are separate from executable adapters and cannot enter a crawl plan.

For every future adapter: read official integration method and current terms first; record retrieval/storage/display scope, attribution and rate rules; fail closed; then implement fetch → normalize → evidence → dedupe → verify → classify. Every field is evidenced or unknown. No user-supplied server fetch URLs. Snapshot excerpts are bounded; terms are referenced/paraphrased rather than copied extensively. Add fixture/malformed/unknown/capital/scope/attribution/rate tests, then one permitted live synchronization pass. Review production quality before enabling ongoing use.

The live test harness caches a response per endpoint for the suite, avoiding repeated polling merely because multiple assertions inspect the same source. HTTPS redirects outside the registered source host are refused. Responses are stream-size bounded; the byte limit works for multibyte text.


## Verification polling defect and corrective guard

DEFECT FOUND during the final rate-policy review: early browser qualification probes, the clean live suite (07:41 UTC) and the first production run (08:00 UTC) used separate polling clocks. Jobicy's initial development requests therefore occurred closer than its published hourly synchronization guidance. This was a workflow defect, even though every contacted source was permission-qualified and no provider reported a rate error. It cannot be described as historical perfect rate compliance.

Corrective action: verification now uses an ignored, on-disk per-endpoint response cache shared across test invocations, records failed requests as interval-consuming, rejects redirects, and refuses a new network pass when the latest production receipt is still inside the source interval. Four offline guard tests prove reuse across cache instances, production-interval refusal, ambiguous-attempt interval consumption and unqualified-host refusal. No more provider probes were made after this discovery. Production reservations already enforce six-hour intervals for both new feeds; the next eligible production time is 14:00:28 UTC. No credentials or provider payloads are committed to implement the cache. Future acceptance must coordinate qualification, verification and production rather than treating tests as an exemption.
