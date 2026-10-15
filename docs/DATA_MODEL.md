# Firestore Data Model

Document shapes are defined in code, not by hand:
`packages/core/src/persistence/firestoreDocuments.ts`. `validateFirestoreDocument`
rejects reserved field-name characters, `undefined` values and oversized
documents before a write is attempted.

## Server-managed (Admin SDK only)

### `opportunities/{id}`
The published, verified record: `PublishedOpportunity` from `@ntk/hunter-core`.
Field groups:

- identity: `id`, `sourceId`, `sourceItemId`, `visibility` (`'published'`)
- display: `title`, `provider`, `category`, `description`, `sourceUrl`, `discoveredAt`, `publishedAt`, `deadline`
- pay: `rewardMin`, `rewardMax`, `currency`, `rewardBasis` (all nullable — the feed may not publish an amount)
- facts: `remote`, `directPay`, `noCvRequired` (tri-state `true | false | "unknown"`), `zeroCapital` (always `true` on a published record), `capitalStatus`
- matching: `countries`, `skills`, `requirements`, `paymentMethods`
- scoring: `rankScore`, `trustScore`, `confidence`, `riskLevel`
- evidence: `evidenceCount`, `evidenceHash`, `fingerprint`
- compliance: `attribution`, `requiresLinkBack`
- bookkeeping: `updatedAt` (when this crawl refreshed the document; `discoveredAt` remains the adapter's capture time)

### The two cost fields, and why there are two

| Field | Meaning |
|-------|---------|
| `zeroCapital` | Default-policy filter flag. Always `true` on a published record, because a capital-required candidate is never published. Kept so the common query stays a single indexed equality filter. |
| `capitalStatus` | The durable public claim: `confirmed_free`, `unconfirmed_no_cost_found` or `capital_required`. **This is the field the UI must render.** |

"No cost was mentioned" is a different claim from "the source says it is free".
Collapsing them is how a product ends up promising something it never verified,
so the published contract, the evidence document, the UI model and the screens all
carry the distinction, and a record written before `capitalStatus` existed is read
as `unconfirmed_no_cost_found` — never as free.

Document id is `"<sourceId>:<sourceItemId>"`, so a re-crawl of the same posting
writes to the same document instead of creating a second one.

### `opportunityEvidence/{id}`
Same id as the opportunity. Holds the proof, never client-writable:
`fetchedAt`, `httpStatus`, `bytes`, `contentHash` (SHA-256 of the exact bytes
fetched), `evidenceHash`, a bounded `excerpt`, the assertion list
(`field`, `value`, `method`, `snapshotIndex`, `confidence`, `text`),
`totalAssertions`, `unknownFieldCount`, `dedupeVerdict`, `capitalStatus`,
`upfrontCostUsd`, `riskFindings`, `scoreComponents`, `pipelineTrace`.

### `internalSourceRuns/{sourceId}_{startedAt}`
One document per source per run: `ok`, `httpStatus`, `bytes`, `itemsSeen`,
`accepted`, `rejected`, `skippedForInterval`, `error`. Backend-only. This is how
"we found nothing" stays distinguishable from "we did not look" and from
"the source refused us".

**Top-level collection, deliberately.** Firestore alternates
collection/document, so `internal/sourceRuns/{id}` is not an addressable document
path — the `{id}` segment would be read as a collection. `firestore.rules` denies
this collection explicitly (`allow read, write: if false`).

## User-managed

- `users/{uid}` — profile, skills, country and preferences.
- `users/{uid}/saved/{id}` — saved opportunity references + cached display snapshot.
- `users/{uid}/applications/{id}` — lifecycle state and notes.
- `users/{uid}/earnings/{id}` — user-entered/verified outcome and payment record.
- `users/{uid}/notifications/{id}` — server-created alerts; user can mark/read/delete.
- `users/{uid}/syncQueue/{id}` — safe offline actions waiting to sync.

## Queries and indexes

The client issues exactly one published query, defined as `PUBLISHED_QUERY` in
`apps/web/src/repositories/opportunityRepository.ts`:

```
collection('opportunities')
  .where('visibility', '==', 'published')
  .where('zeroCapital', '==', true)
  .orderBy('rankScore', 'desc')
  .limit(max)
```

`firestore.indexes.json` declares the matching composite index
(`visibility` ASC, `zeroCapital` ASC, `rankScore` DESC), and a unit test asserts
that the declaration exists. A second index
(`visibility`, `category`, `discoveredAt`) is reserved for the category screen.

### Profile document

`users/{uid}` holds the profile and preferences described in
`apps/web/src/auth/userProfile.ts`: primary market, additional markets, skills,
preferred categories, zero-cost preference, direct-pay preference, CV/portfolio
preferences, competition preference and notification channels. Every write is
validated first, and the repository refuses a uid that does not match the
authenticated uid.

The same constant is used again in `test/helpers.ts`, which asserts the query
filters only on fields every published document sets — a filter on a field the
writer leaves unset would silently drop records.

## Offline cache (browser, IndexedDB)

`apps/web/src/offline.ts`, database `ntk-income-hunter` v2:

- `opportunities` — the UI view model, keyed by id.
- `evidence` — the bounded evidence summary shown on the detail screen.

A cached record with no `capitalStatus` is read back as
`unconfirmed_no_cost_found`, never as confirmed free.

The offline contract is enforced by what these stores hold: display data only.
No provider secret, private key or privileged credential is ever written to
IndexedDB, and the UI reports "0 secrets cached".

## Privacy/security

Provider API keys and service secrets never enter client-readable documents.
Crypto seed phrases and private keys are not supported or stored anywhere in V1.
