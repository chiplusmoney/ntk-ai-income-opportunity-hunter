# Hunter Pipeline

```
Discover -> Fetch -> Normalize -> Deduplicate -> Evidence Capture ->
Eligibility -> Risk/Trust Rules -> Base Score -> AI Analysis -> Final Rank ->
Notify -> Track Outcome -> Learn
```

Implemented in `packages/core`, driven by `services/hunter-api`:

| Stage | Module | Notes |
|-------|--------|-------|
| Discover / Fetch | `sources/adapters/*` | One adapter per registry entry, injectable `fetch` + clock |
| Normalize | `sources/adapters/shared.ts` | Missing fields become `absent` assertions, never guesses |
| Evidence Capture | `evidence/index.ts` | SHA-256 over the fetched bytes, bounded excerpts |
| Deduplicate | `pipeline/dedupe.ts` | Same-source re-crawl, provider+title fingerprint, Jaccard near-match |
| Eligibility | `pipeline/eligibility.ts` | Tri-state; only a positively failed blocking check rejects |
| Zero capital | `pipeline/zeroCapital.ts` | Blocking cost patterns; sets the durable `capitalStatus` |
| Risk / Trust | `pipeline/risk.ts` | 15 deterministic rules; critical findings withhold before any model |
| Base Score | `pipeline/scoring.ts` | 10 weighted components, weights sum to exactly 1 |
| Orchestration | `pipeline/run.ts` | `runHunt()` with injected clock and fetch |
| Scheduling | `sources/schedule.ts` | Pure `planCrawl()`: due sources, stalest first, batched, capped |
| Persistence | `persistence/firestoreDocuments.ts` | Validated document shapes + `validateFirestoreDocument` |
| Optional analysis | `ai/*` | Capability request, free-first route, validated response |

Not implemented yet: Notify, Track Outcome, Learn (M5+).

## Cost status: the one thing every stage must preserve

`zeroCapital` alone cannot express the difference between "the source says it is
free" and "we found no price", so the pipeline carries a typed status:

| `capitalStatus` | Set when | Published? |
|-----------------|----------|------------|
| `confirmed_free` | the source states no upfront payment (`costConfirmed`, `upfrontCostUsd: 0`) | yes |
| `unconfirmed_no_cost_found` | nothing about cost was found (`upfrontCostUsd: null`) | yes, worded as unverified |
| `capital_required` | a cost is stated for the applicant | **never** — `toPublished` throws rather than storing a false $0 claim |

The eligibility check mirrors it exactly: `confirmed_free → true`,
`unconfirmed_no_cost_found → unknown`, `capital_required → false`.

## Hard rule

AI analysis may only receive normalized candidate data plus referenced evidence.
This module produces exactly that: any field the pipeline could not establish
from a captured source record is `unknown`/`null`, and `unknownFieldCount`
records how many.

## Score dimensions and weights

| Component | Weight | 0 | 100 |
|-----------|--------|---|-----|
| `sourceReliability` | 0.14 | source baseline 0 | baseline 100 |
| `directPayCertainty` | 0.12 | stated prize/benefit | stated payment for work |
| `eligibilityConfidence` | 0.12 | blocking check failed | all checks passed on evidence |
| `zeroCapital` | 0.16 | cost stated | source states $0 up front |
| `rewardValue` | 0.16 | below $3/h equivalent | ≥ $60/h equivalent |
| `skillMatch` | 0.10 | no overlap | strong overlap with your skills |
| `competitionLevel` | 0.06 | competitive listing | direct award, high product priority |
| `freshness` | 0.06 | > 90 days old | ≤ 2 days old |
| `effort` | 0.04 | unbounded brief | concise, bounded brief |
| `history` | 0.04 | 0% historic success | 100% historic success |

`rankScore = clamp(Σ weighted − (100 − trustScore) × 0.15)`, rounded once.
`trustScore` comes from the risk engine; `confidence` measures how much of the
record was actually established and is deliberately independent of reward size —
a large number with no evidence must not look more trustworthy than a small one
with evidence.

Weights sum to exactly 1 (asserted by a test), so the unpenalised maximum is 100.

### Reward normalization assumptions

Comparing pay across postings needs a common unit, so `reward.ts` converts to an
hourly equivalent with fixed, published assumptions:

| Stated basis | Assumption |
|--------------|------------|
| `hour` | as stated |
| `day` | ×8 hours |
| `week` | ×40 hours |
| `month` | ×160 hours |
| `year` | ÷2000 hours |
| `one-off` / `unknown` | **not** converted; scored on a capped band |

These are ranking judgements, not claims about a posting. A non-USD amount is
never converted — no FX rate exists in evidence, so it is scored on a lower
capped band and the component note says so.

## Evidence record

Every candidate stores: source URL, discovery timestamp, source type, the
SHA-256 hash of the fetched payload, the payload size and HTTP status, a bounded
verbatim excerpt, the extracted claims with the method and confidence used, and
the run timestamp. A recheck can therefore prove whether the upstream payload
changed.

## Stage order and why

Deduplication runs first so no further work is spent on a repeat, then
zero-capital sets the tri-state the eligibility engine reads, then eligibility
gates, then risk. A candidate that trips a critical risk rule is `withheld`
before scoring, and nothing reaches an AI stage.
