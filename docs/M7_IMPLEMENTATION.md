# M7 implementation — v0.6.0

Status: implementation and acceptance in progress. No final production/package verdict yet.

## Architecture and migration

Reuses Firebase Spark, Render Free, the canonical Cloudflare Worker and existing 30-minute cron. No additional infrastructure, paid source, AI provider or paid notification service. No profile facts, applications, outcomes or payments fabricated. Real AI interfaces remain separate and unconfigured.

Two reviewed source adapters add Jobicy and We Work Remotely. Both preserve unknown reward/eligibility/deadline/document facts and the existing tri-state capital assessment. Source attribution and official links are retained.

Production ingestion adds an `IntelligenceWriter` around the existing validated writer. It uses direct indexed identity reads, never an unbounded catalog scan. Exact source IDs remain authoritative; cross-source merges require the same employer/title plus canonical URL or near-identical substantial text, compatible location and publication time. Different same-source requisitions remain distinct. Richer evidence can replace a weaker mirror under the original public document ID; secondary provenance is bounded to six references. Existing application IDs remain valid. Legacy M6 rows acquire identity bookkeeping on the next relevant crawl; no destructive historical merge/migration is attempted.

The public opportunity keeps its initial discoveredAt across refreshes. Content hashes skip unchanged catalog/evidence writes within a day. Operational summaries record actual attempts independently. At most 200 incoming publication candidates are processed per pass. Overflow is stored in a server-only queue, and at most 50 deferred records resume before new work; they are reverified against the current clock and current source permission without fetching again. Queue/source/index documents are additive; no existing production records/indexes are deleted.

Persistent ten-minute scheduler leases prevent overlapping Render instances. Source attempts are reserved before network access, surviving a crash/restart. Provider polling floors still apply to forced/internal requests. A failed attempt consumes its interval, avoiding retry hammering. No artificial keep-alive traffic.

## Source health and yield

Owner-authenticated `GET /v1/operations`, Firebase ID-token verification with revocation check and no-store, returns selected operational data. Owner UID comes only from the existing server configuration; absence/mismatch fails closed. Arbitrary users cannot read the internal Firestore collections. Source Health separates permission from technical availability and exposes failure, rate state, crawl/success/due times, fetched/accepted/rejected/duplicate/unknown/write counts and data-quality rates.

Operational source score uses measured fetch success, verification survival and useful field rates, penalizing malformed/duplicate records. It does not alter legal permission or claim popularity as truth. No outcome yield is invented: application/payment source yield remains unavailable until real attributable outcomes exist. Personal Fit yield is measured for the current loaded catalog and declared profile, labelled separately from global ingestion.

UTC daily summaries distinguish fetched attempts, accepted verification (including drafts), rejected, duplicates, new vs known, published/refreshed vs unchanged and physical write categories. New-record dimensions include source/category/country/capital/reward. Repeated fetch attempts are not called unique discoveries. Country tags may overlap. These metrics are opportunity analytics, never income.

## Smart alerts and digest

Existing private `m6Notifications` policy migrates by optional fields; disabled remains disabled. Controls: instant/digest, rules, categories, country/global filters, fit threshold, in-app/owner Telegram, quiet timezone/hours, maximum 1–3 deliveries/day, digest hour and 1–10 items. Equal quiet start/end disables quiet hours. Invalid policies/timezones fail closed. Minimum six-hour cooldown always applies; local day boundaries use policy timezone.

Rules include strong fit, high-fit direct pay, explicitly confirmed $0, explicitly no CV AND no portfolio, saved deadline, follow-up, next action, status reminder and payment follow-up. Discovery obeys filters/fit, excludes blocked fit and looks at recent discoveries; reminders derive only from actual private applications. A minimal profile is never filled with guesses.

Server evaluation follows ingestion and cannot undo source writes on notification failure. A persistent UID cursor rotates at most two opted-in users per pass. Empty tail wraps; <=100 newest public rows plus <=50 saved rows/user, <=50 applications and <=20 proofs/user. Over-cap private histories skip rather than pretend complete. Candidate attempts are capped at 20; one delivery/user/pass. Full fan-out is never client privileged. At 48 heartbeats/day the worst-case notification reads remain bounded; processing latency grows with opted-in users, and Spark headroom must be reviewed before lifting these caps.

Daily digest considers selected recent discoveries since previous digest (first: prior 24h) plus actual due reminders. It deduplicates opportunities, bounds 1–10 items, waits for configured hour and quiet-hours end, and reserves at most one digest per local day. In-app details carry reason, source URL, fit, category, uncertainty, capital, advertised reward and known deadline. Telegram appends only whole entries within 3,800 characters.

Delivery selection, policy re-read, cooldown/daily counter and permanent attempt records are transactional. Deleting a notification receipt does not delete its attempt. Recent-key memory is an optimization, never the dedupe authority. Telegram token/destination remain server-only and only the configured owner UID can use that destination. One send attempt maximum; an HTTP error or ambiguous timeout is consumed without automatic resend, preferring possible missed notification over duplicate spam. Mock transport verifies this. Existing accepted Telegram transport evidence is reused; no new live message is required.

Private notification state uses existing UID-keyed RAM-only Firestore listeners, recovers from server on reconnect and is masked on account change. Read/unread/delete can never edit server delivery evidence. The avatar dropdown remains the sole profile navigation; footer slogan stays removed. Source Health is lazy-loaded. SW m7-v1 preserves no-cache route navigation and excludes private/external requests.

## Rollback and security

Source baseline `m7-baseline-0.5.0` / `8a308abb5ed0a177ac8a11171ae7107a381bacc5`; accepted M6 archive retained unchanged until final promotion. Rollback client/API together while preserving private M6/M7 data and new internal records. Do not restore old scheduler credentials or orphaned Worker. No secret belongs in Git/ZIP/browser cache.

Unrelated historical Firebase CLI OAuth cleanup remains an owner security action, outside this account. Never switch accounts or reproduce credentials. The status does not block M7.
