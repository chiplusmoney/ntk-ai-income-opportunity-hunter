# M6 acceptance - in progress

Status: PARTIAL. Not yet the final M6 verified verdict.

Baseline preserved: 0.4.1 / 926c2467cfbb08bdeb71cd59fea980566f91938d. Source checkpoint `m6-baseline-0.4.1`; accepted M5b ZIP remains intact and canonical until M6 live acceptance and packaging pass.

Final clean automated pass (2026-10-16T06:12:53.383Z, Node 24.20.0): 561 unit tests (core 388, web 81, API 83, scheduler 9), 8 permitted-source checks, 43 emulator/security cases; no failures; clean install, all typechecks/builds PASS; audit zero vulnerabilities. No existing test removed; the old ledger integration now exercises the frontend through the authenticated API against the actual Firestore emulator, preserving payment, duplicate, expected-reward and sign-out/offline assertions.

Local Neo: public recommendation cards and separate scores render; search/views/confirmed no-document empty state checked. Private proof access correctly requires M6 rules, so full owner journeys await coordinated release. Initial clean install file lock resolved by stopping Vite. Firebase console confirms Spark under chiplusmoney, Render confirms Free and accepted baseline commit, canonical Cloudflare cron readback remains */30 * * * *.

Remaining mandatory gates: final affected checks/security scan, reviewed push/Render deployment, Firestore rules/indexes/Hosting deployment, authenticated live owner journeys, desktop/tablet/mobile screenshots, offline/reconnect, persistence, export, final package measurements and independent archive readback.

Existing unrelated Firebase CLI OAuth incident remains an owner security action; no credential value is included. See OAUTH_SECURITY_ACTION.md. Do not revoke unrelated accounts in this task.
