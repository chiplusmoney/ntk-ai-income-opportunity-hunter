# M8 acceptance — PARTIAL, Engine target not established

Verdict: **`M8_PARTIAL_ENGINE_TARGET_NOT_ESTABLISHED`**.

M8 is **not accepted or closed**. The production application remains accepted M7 **0.6.0**, baseline `4c94a5212195e9f170f3787c185227ad75da2ce3`. This continuation changes documentation and verification/packaging tools only. No AI feature, runtime transport, schema, user preference, database rule, application asset or production setting was changed.

See [Engine discovery](M8_ENGINE_DISCOVERY.md), [handoff](M8_HANDOFF_STATE.md), `verification/m8-discovery.json`, and the separate regression receipt `verification/m8-discovery-checks.json`. Accepted M7 receipts are retained unchanged and keep their original dates and limitations.

## Requirement reconciliation

| M8 scope | Status | Evidence / dependency |
|---|---|---|
| Preserve M7, separate Engine/router/pool | VERIFIED for this continuation | No runtime/source/data/configuration changes; baseline rollback branch and accepted archive preserved. |
| Discover authoritative Engine and current API (2–4, 7, 33) | PARTIAL / BLOCKED | Accessible local/project/account discovery found separate pool and planned clients, no verified Engine target or contract. No Engine changes. |
| Real Engine health, provenance, free-first enforcement, usage/cost/quota/cache (5–7, 10, 19–23, 27) | NOT IMPLEMENTED / NOT VERIFIED | Cannot safely invent API semantics, cost attestation or free-route guarantees. No real AI request made. Baseline paid authorization remains false. |
| Opportunity analysis, fit explanation, proof assistance, drafting, comparison, next action (8–9, 13–18) | M8 NOT IMPLEMENTED | Existing deterministic features remain. Existing injected AI tests are not real Engine acceptance. |
| Optional AI; on-demand operation; deterministic notification policy (11–12, 29) | BASELINE PRESERVED | No automatic AI/enrichment/digest call introduced. No Telegram message or external application submitted. |
| Privacy/injection/output validation, architectural separation, user controls (23–26, 28) | BASELINE ONLY | Existing tests re-run where reported. No claim of a deployed M8 security boundary or controls. |
| Mandatory real production free calls (30) | NOT TESTED — BLOCKED | Zero of four mandatory capabilities exercised through the real Engine; comparison/planning not implemented. |
| Live AI safety/cache/failure cases (31) | NOT TESTED — BLOCKED | Unit/injected tests do not replace these gates. No adversarial request sent to production. |
| Cost acceptance (32) | PARTIAL | This continuation made zero AI inference requests and incurred zero requested AI spend; current Hunter reports paid authorization false. Engine account-wide costs/free routes are NOT VERIFIED. No billing/subscription change. |
| Performance/storage/rules (34–36) | M8 NOT IMPLEMENTED | No new AI endpoint, collections, stored drafts or audit payloads. Existing Firestore rules retained. No invented latency/concurrency/memory measurements. |
| Offline/responsive/accessibility/live UI (37–38, 41) | BASELINE ONLY | M7 browser/offline evidence retained with date; limited current live checks separately recorded. No new AI surfaces to accept. |
| Existing sources/infrastructure/owner facts (1, 39, 42–43) | PRESERVED | No source permission/cadence changes, provider calls, resource recreation or profile embellishment. |
| Workspace/docs/owner OAuth cleanup (44–46, 49) | PARTIAL HANDOFF | M7 archive retained byte-for-byte. Partial package clearly distinguishes accepted runtime from blocked milestone. OAuth housekeeping remains owner-only; no credentials reproduced. |
| Final M8 verification / preferred verdict (47–48) | FAIL TO QUALIFY | Regression, security scan and archive checks do not satisfy real Engine connection or live capability gates. Preferred verified verdict must not be used. |

## Capability matrix

| Capability | Current deterministic behavior | Real M8 Engine call |
|---|---|---|
| Opportunity summary/analysis and requirements | Captured facts, unknowns and rule-based risk | NOT IMPLEMENTED |
| Personal Fit explanation | Deterministic fit score/reasons/unknowns | NOT IMPLEMENTED |
| Proof summary | Selected genuine proof with provenance | NOT IMPLEMENTED |
| Application drafting purposes | Bounded preparation templates and cited facts | NOT IMPLEMENTED |
| Comparison | Existing deterministic recommendation/fit comparison | NOT IMPLEMENTED |
| Next action | Existing checklist and lifecycle notes | NOT IMPLEMENTED |

No provider/model was exercised. No output was labeled AI-assisted. No fabricated qualification, reward, eligibility, payment or application outcome was created.

## Grounding and threat model for resumption

The future integration must load authoritative records server-side after revoked-token verification, minimize selected user context, delimit listing text as untrusted data, validate the whole response and preserve evidence-owned fields. It must not admit a paid request before dispatch; rejecting a charged response alone cannot guarantee zero spend. Unknown tier/cost or missing free-route attestation must fail closed. No provider key/model may be chosen by Hunter.

Cache identity must include UID for private context, capability, evidence/profile/selected-proof hash and policy version. Server-owned metadata/audits need explicit rules denial to client forgeries. Durable quotas/concurrency admission and bounded retention must precede production use. Outputs must render as text, preserve evidence references and generated/cached timestamps, and fail safely without replacing deterministic data. These are **requirements, not implemented M8 controls**.

## Migration, release and rollback

No runtime migration, deployment command, rule change, Engine configuration or secret installation was performed. Documentation pushes can trigger the existing Render main auto-deploy; that is the same application code and is recorded separately, never an M8 AI release.

Rollback reference: branch `m8-baseline-0.6.0`. Restore only source where needed; preserve current Firestore owner data, encrypted canonical Worker binding, mounted Render service credential, notification attempt ledger and provider state. Do not restore legacy scheduler credentials. Partial handoff promotion archives M7 package bytes unchanged; it does not supersede M7's accepted runtime verdict.

## Fresh regression evidence

`verification/m8-discovery-checks.json`, completed 08:52:15 UTC on Node 24.20.0: clean install PASS; typecheck PASS; core 434, web 83, API 85, scheduler 9 Vitest unit cases (611), plus 4 Node polling-guard cases = **615 passed, zero failed**. Separately, **64 emulator/security cases passed**. Build PASS; dependency audit **zero vulnerabilities**. The eight upstream-source cases were deliberately not executed again; dated M7 provider evidence remains, and current owner operations confirms the same six enabled source policies/intervals. No real AI acceptance is included in these counts.

Current source/history/bundle credential-pattern scan is recorded separately. Pattern scans have limited detection coverage and do not certify historical transcripts or external account security. Separate archive readback verifies hashes, CRC, every source/reference byte, canonical remote main and unchanged accepted M7 ZIP; it is not an independent code review.
