# M5b final hardening state

Date: 2026-10-16 (Africa/Lagos). Version 0.4.1. Verdict: **M5b_LIVE_DEPLOYMENT_AND_ACCEPTANCE_VERIFIED**. M6 is NOT STARTED.

The owner explicitly designated accessible chiplusmoney Cloudflare account `4f67a960d66dff69c2fcab490616c811` authoritative and authorized one replacement Worker. The prior partial blocker is closed; the inaccessible old account was not changed.

## Verified production chain

Canonical Worker: `ntk-income-opportunity-hunter-scheduler` on Workers Free, https://ntk-income-opportunity-hunter-scheduler.chiplusmoney.workers.dev. Public health returns 200. A real browser POST /run returns 404. The deployed JavaScript matches the tested build byte for byte. The internal credential is an encrypted secret_text binding; public HTTP cannot trigger hunts.

A brand-new cryptographic credential was synchronized only into Render and the new Worker. Earlier values were not recovered or reused. Fresh authentication returns 200; missing/invalid credentials return 401. Actual legacy calls produce invalid-credential rejections in Render; the old Worker's external wrapper throws 500/1101. It cannot authorize a hunt.

Production cron is `*/30 * * * *`. A temporary one-minute cron was enabled for proof at 02:00:53 UTC and restoration was accepted at 02:09:56 UTC immediately after an observed success. Cloudflare propagation continued some already distributed short-interval events; source interval enforcement prevented repeated crawling. Settings readback confirms the restored cron. No keep-alive automation or forced source interval was added.

Cloudflare scheduled event, provider request `638eb48035ad1c5b31d18ab41bb728dc`, and Render agree on run `run_2026-10-16T02:17:09.869Z`: 128 published, 17 drafts, 259 document writes, zero failed writes, no AI calls. The next scheduled run at 02:18 wrote zero. Firestore source-run readback and paired new opportunity/evidence documents match the due run. Remotive correctly remained interval-skipped; only Arbeitnow, GitHub bounties and Remote OK were due.

## Product and checks

The approved single avatar dropdown, Settings navigation, removed footer tag, real Auth and private UID-scoped records are preserved. One real saved application remains saved; actual earnings remain zero. No fabricated payment or user outcome was created. Offline full reload shows 50 public cached cards while private data is protected until reconnection. Desktop, tablet and mobile were checked again.

Clean install, typecheck, build, 479 unit tests, 8 permitted-source checks and 29 emulator/rules tests pass. Dependency audit: zero vulnerabilities. Reviewed Firebase rules remain deployed and fresh isolation probes pass. Existing Telegram delivery remains valid; no new test was sent.

## Remaining owner security action

**OWNER SECURITY ACTION STILL REQUIRED** for the earlier unrelated Firebase CLI OAuth grant. Its cached account identity differs from chiplusmoney and was not used or switched into. See OAUTH_SECURITY_ACTION.md for precise revocation guidance. The project verdict verifies this application's production chain; it does not claim the unrelated grant was revoked or that the earlier transcript is credential-free.

## Preservation

Firebase, Render, production data and Telegram were preserved. New infrastructure: exactly one authorized free Worker; no paid add-on or billing change. Rollback branch `m5b-pre-canonical-scheduler-20261016` preserves the hardened baseline; older `m5b-pre-hardening-20261015` is retained for provenance. Keep the new account/name and fresh encrypted values during any rollback. Do not reactivate the legacy scheduler or restore exposed credentials.

Final regular-cron confirmation: actual provider event `*/30 * * * *` completed at 2026-10-16T02:30:27.919Z (03:30 Lagos). Cloudflare and Render match `run_2026-10-16T02:30:27.644Z`, zero writes, zero failures. The last observed short-interval propagation event was 02:21 UTC; the regular production cadence is now proven. See verification/regular-cron.json.
