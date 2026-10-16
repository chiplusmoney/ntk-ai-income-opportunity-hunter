# Self-contained final M5b handoff

Date: 2026-10-16. Version 0.4.1. Verdict: **M5b_LIVE_DEPLOYMENT_AND_ACCEPTANCE_VERIFIED**. M6: NOT STARTED.

This existing React/Vite/Firebase PWA discovers permitted public job/bounty opportunities, records source evidence, ranks deterministically and lets signed-in users save applications and record actual payments. Render hosts the Node API. A canonical free Cloudflare Worker provides the scheduler heartbeat; the API persists interval state in Firestore.

## Authoritative production endpoints

- Firebase project: ntk-income-opportunity-hunter (existing Spark project).
- Hosting: https://ntk-income-opportunity-hunter.web.app
- Render API: https://ntk-hunter-api.onrender.com
- Canonical scheduler: https://ntk-income-opportunity-hunter-scheduler.chiplusmoney.workers.dev
- Canonical Worker name: ntk-income-opportunity-hunter-scheduler
- Authoritative Cloudflare account: 4f67a960d66dff69c2fcab490616c811, chiplusmoney, Workers Free.
- Production cron: */30 * * * *.

The owner explicitly authorized this replacement Worker rather than continuing to seek the inaccessible account. The old https://ntk-income-hunter-scheduler.ntk-note.workers.dev is **LEGACY_ORPHANED_WORKER - INACCESSIBLE - CREDENTIAL INVALIDATED - NOT CANONICAL**. Do not rely on it or modify its inaccessible account.

## What is verified

The new deployed module matches the tested compiled build. Public health is 200; actual browser POST /run is 404. No public HTTP hunt trigger exists. A brand-new cryptographic shared value is stored only server-side in Render and the encrypted Worker binding; it is omitted from source, logs and this package. Fresh API authentication is 200; missing/invalid requests are 401. Earlier values were not recovered or reused. Actual legacy attempts are rejected in Render; the old wrapper returns 500/1101.

A temporary one-minute cron proved the real scheduled path. Restoration to */30 was accepted at 02:09:56 UTC immediately after the observed successful receipt. Cloudflare propagation allowed some short-interval invocations afterward; the API respected source intervals throughout. No keep-alive schedule or forced crawl was added.

At 02:17:09.869 UTC (03:17 Lagos), a real scheduled run of due Arbeitnow, GitHub bounties and Remote OK produced 128 published results, 17 drafts and 259 writes with zero failures and no AI calls. Cloudflare request 638eb48035ad1c5b31d18ab41bb728dc and Render agree on run_2026-10-16T02:17:09.869Z. Firestore source-run timestamps and paired evidence records match. The following scheduled run at 02:18 wrote zero. Remotive's six-hour interval was not due. Devpost, Freelancer and public-scope Hacker News remained excluded.

One actual saved application remains in the owner's account, in saved state. Earnings remain zero, with no invented history or success percentage. The single top avatar dropdown, actual provider photo, Settings navigation and removed footer slogan are preserved. The dropdown provides profile, security, settings, notifications, export and sign-out. Auth sign-out and Google return preserve the same account data. Email/password's earlier live signup/signin evidence is retained; no duplicate test account was created.

Existing Telegram controlled delivery at 2026-10-16T01:14:54.136Z, provider message ID 5, remains the only smoke test. It was marked read and deleted in the app during prior acceptance; the permanent server-only attempt ledger remains. No additional test was sent during closure. Automated opportunity broadcasts, email and push are not claimed by this bounded channel transport acceptance.

Desktop, tablet and mobile screenshots are current. Offline full reload shows 50 public cached opportunities; private records are protected until reconnecting. Service worker and public-only IndexedDB caching remain active. Normal Firebase Auth session persistence is intentionally retained. The mounted Render service account performs a real Firestore read; the unnecessary local download is absent.

## Checks and evidence

Clean install, typecheck, all workspace builds, 479 unit tests, 8 permitted-source checks and 29 emulator/integration/rules tests pass. Audit: zero vulnerabilities. Payment/atomicity/replay fixtures run only in the emulator and never create a production payment. The frontend entry remains about 271 kB gzip; physical-device/performance certification is not claimed. The existing AI assistant remains a scaffold; no M6 features were added.

Machine receipts are in docs/verification: automated.json, scheduled-chain.json, cloudflare-event.json, cloudflare-console.json, cloudflare-due-hunt.json, render-scheduled-hunt.json, post-scheduler-status.json, firestore-persistence.json, live-security.json, worker-deployment.json and final audit files. Exact final filename, bytes, entries, SHA-256, source commit and checksum recomputation are measured after ZIP creation in external package-verification.json; no circular archive self-hash is claimed.

## Remaining owner security action

**OWNER SECURITY ACTION STILL REQUIRED** for the earlier unrelated Firebase CLI OAuth grant. Account email metadata identifies a different cached identity from chiplusmoney. No credential value is reproduced or copied into canonical artifacts, and no unauthorized account switch was made. The affected owner should use their own Google Account > Security > Connections to third-party apps and services, remove the Firebase CLI connection, and reauthorize only when needed. See OAUTH_SECURITY_ACTION.md. The application verdict does not assert revocation of that unrelated grant or a credential-free historical transcript.

## Preservation, cost and rollback

Firebase, Render, production user data and Telegram are preserved. Exactly one new free Worker was authorized and created; no paid add-on, billing upgrade or paid AI call. Rollback branch m5b-pre-canonical-scheduler-20261016 preserves the hardened baseline. Preserve the new Worker account/name and fresh synchronized values when rolling code back. Never reactivate the orphaned scheduler, old public manual trigger or prior exposed credential. Source and final receipts are pushed to canonical main; the previous partial handoff is preserved under ARCHIVE.

Final regular-cron confirmation: actual provider event `*/30 * * * *` completed at 2026-10-16T02:30:27.919Z (03:30 Lagos). Cloudflare and Render match `run_2026-10-16T02:30:27.644Z`, zero writes, zero failures. The last observed short-interval propagation event was 02:21 UTC; the regular production cadence is now proven. See verification/regular-cron.json.
