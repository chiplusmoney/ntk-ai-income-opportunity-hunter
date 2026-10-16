# M6 personalized intelligence and earning optimization

Version 0.5.0. Baseline: 926c2467cfbb08bdeb71cd59fea980566f91938d (0.4.1). M5b remains closed. M6 acceptance is recorded separately; implementation alone is not a verified release.

## Data model and migration

Backward-compatible optional fields at `users/{uid}`: `earningProfile` (version 1), `earningProfileUpdatedAt`, `recommendationLearning` (enabled/resetAt), and `m6Notifications`. Existing identity/preferences fields remain intact. Old country/skill/category fields provide a read fallback; reading does not write a migration. No production record deletion or infrastructure recreation is required.

Private `users/{uid}/proofs/{id}` records select title, kind, description, skills, HTTPS evidence URL, provenance, status, sourceIds and timestamps. Manual proof is user-declared or incomplete. Only the trusted server imports a submitted/paid Hunter application, and labels the external outcome owner-declared. No automatic GitHub crawling, binary file storage or claimed external verification is introduced. Screenshots/certificates can be referenced with genuine HTTPS links. Deterministic capability cards and explicitly selected local HTML portfolio exports retain provenance. Private records are never automatically published.

Applications preserve old IDs and fields and add optional nextAction, followUpDate, attachedProof and outcomeReason. Preparing and Withdrawn extend the existing lifecycle. Opening an official URL never records Applied. Existing Saved -> Applied remains valid. History is retained; paid/rejected/expired/withdrawn are terminal. Metadata edits use an updatedAt conflict check. No synthetic application/payment history is seeded in production.

## Fit algorithm v1

Global evidence/rank scores are unchanged. Personal Fit is a distinct 0-100 compatibility score, not an acceptance probability. Fixed maxima: location 20, skills 30, category 10, capital 10, work format 5, payment 5, CV/portfolio readiness 6, genuine proof coverage 4, experience 5, comparable advertised reward 5. Unknowns contribute zero rather than being assumed satisfied. Skills compare normalized exact names; no semantic equivalence is invented. Rewards compare only matching currency and payment period; there is no exchange-rate or salary-to-task conversion.

Known location exclusion, upfront capital, expired source deadline, remote-only conflict and explicit category exclusion hard-block with score zero. A listed location match is not independent work-authorization verification. Missing location, language, payment, documents, competition, devices and other source details remain visible unknowns. Optional profile fields unsupported by structured source evidence are retained as context, not used to invent matches. Deadline tolerance warns when preparation time is short. Every result provides reasons, component contributions, skill gaps, proof IDs, risks, unknowns, friction and a next action. Ranking is memoized by catalog/profile/proof/outcome/minute revisions; tie-breaking uses global rank then ID.

No CV / portfolio filters require affirmative source statements. Not mentioned is unknown, never not required. Conflicting text resolves conservatively. Beginner, skills test, paid training, direct task and quick-application labels require explicit signals; research/testing needs direct-pay evidence. Source evidence remains accessible.

## Proof and assistant grounding

The complete M6 assistance capability contract accepts explanation, cover note, pitch, proposal, answers, introduction, proof summary, skill gap, comparison and planning requests. It works deterministically without any provider. The real FlagshipRouter endpoint is not configured. Paid AI remains DISABLED. FlagshipRouter is an independent adapter contract; FreeLLMAPI remains a separate provider pool, with no source-tree merging.

Before display, optional AI output must contain only allowlisted existing fact IDs and approved suggestion strings. Extra free-form prose, unknown IDs or invented suggestions are rejected, and a deterministic draft is returned. Facts are copied from the source/profile/proof, never rewritten into qualifications. Provider errors also fall back. Source fact, user fact and drafting suggestion remain distinct. Drafts are preparation material, require owner review and never submit an application automatically. The application checklist includes source requirements, missing-document warnings, real proof, unknowns and official submission instructions.

## Outcome learning and earnings truthfulness

Learning defaults off; owner can enable/reset or disable in Settings. For a category, actual applied records contribute at most +2, accepted/active/submitted/paid records +2 each and rejected records -1 each, bounded to [-6,+6]. Only lifecycle history newer than reset participates; editing old notes does not resurrect an earlier outcome. Learning reads only the current UID and cannot override hard gates. Reset changes its epoch without deleting real outcomes.

Actual earnings use private receipt documents only, never advertised reward or expectedRewardUsd. Trusted API validates the real lifecycle, positive finite USD amount, non-future date, payment-method bounds and explicit received-payment confirmation, then atomically records one owner-declared receipt under the application ID. A direct browser write to earnings or lifecycle updates is denied. This is owner attestation, not payment-provider verification. Expected rewards and grouped advertised ranges are labelled potential/not-earned. No currency conversion or income guarantee is claimed.

## Notifications

Disabled by default. Opt-in rules: strong fit, confirmed zero, direct paid, saved deadline, follow-up, stale status and payment follow-up. Existing scheduled hunts perform a bounded pass: <=10 opted-in users, <=100 newest catalog rows, <=500 applications and <=100 proof records per user, <=1 new notice/user/pass. At most 3 notices/day and a minimum 6-hour cooldown; timezone quiet hours apply. Malformed quiet-hours settings fail closed. This bounded first release is not an unlimited multi-user notification service; saturation is documented rather than causing unbounded Spark reads.

A server-only deterministic attempt key survives deleting the in-app receipt. Transactional reservation prevents concurrent duplicates. Existing owner Telegram can be opted in; arbitrary browser-supplied Telegram destinations are not accepted. An ambiguous Telegram attempt is consumed without retrying, to avoid duplicate spam. No new live test is necessary for the already verified transport; development tests use emulator data and mocked/no destinations. Source ingestion survives notification failures.

## Security and offline behavior

All new collections are UID-private. Firestore rules deny anonymous/cross-user proof access, forged imported/verified proof and all client earnings writes. Lifecycle and preparation metadata mutations now use `/v1` API with verified, revocation-checked Firebase ID tokens. The API derives UID from the token, never the request body. Production origin allowlist, no-store responses, bounded JSON and per-process UID rate limits apply. No provider key, service account or scheduler credential enters the web bundle.

Public IDB opportunities and same-origin PWA assets remain available offline. Private records stay in account-scoped RAM. After an online-confirmed read, offline UI identifies retained records as last confirmed. A full offline reload never invents empty private ledgers. Profile drafts, application notes and safe saves can queue in RAM only. Reconnect performs conflict-checked operations; failed drafts remain for review. Sign-out, account change and reload discard drafts. Payments, outcomes and proof changes are online-only. No server credential or authenticated evidence is persistently cached.

## Release and rollback

Deploy to the existing Render service, then deploy Firestore rules/indexes and Hosting after tests. Canonical Worker code and 30-minute cron are preserved. Spark, Render Free, Cloudflare Free and existing source restrictions remain. The M5b ZIP remains canonical until all M6 production gates pass; it is then moved intact into ARCHIVE by verified packaging. Source rollback checkpoint: `m6-baseline-0.4.1`. Prefer a forward fix if M6 records exist; do not deploy a pre-M6 browser against stricter rules without coordinated API/client compatibility. Do not remove new proof data, restore old secrets or resurrect the legacy Worker during rollback.
