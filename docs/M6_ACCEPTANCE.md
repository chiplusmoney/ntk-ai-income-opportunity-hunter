# M6 production acceptance — version 0.5.0

**Live gates: VERIFIED.** The final overall milestone verdict is issued only by the measured canonical package receipt after ZIP integrity and secret scans. See M6_PACKAGE_ACCEPTANCE.json at the archive root and the checksum/independent verification alongside the archive.

The accepted M5b baseline is 0.4.1 at 926c2467cfbb08bdeb71cd59fea980566f91938d. It remains a preserved rollback checkpoint (m6-baseline-0.4.1). No Firebase, Render or Cloudflare resource was recreated.

| Gate | Actual evidence |
| --- | --- |
| Implementation | Progressive private earning profile; provenance-based Proof Builder; separate deterministic Personal Fit; recommendation views/explanations; preparation, lifecycle metadata, learning, earning optimization and opt-in notifications |
| Automated | Clean install under Node 24.20.0, all-workspace typecheck/test/build; latest combined counts **564 unit tests: 389 core, 83 web, 83 API, 9 scheduler; 8 permitted-source live cases; 43 emulator/security cases; zero failures/audit vulnerabilities** |
| Fix verification | Original complete clean receipt and affected follow-up receipts retain actual timestamps. Drafting fixes passed all-workspace checks; SW fix passed web tests/typecheck/build; hash wrapping passed final web build/typecheck. No dependency changes. Do not present separate runs as simultaneous. |
| Deployment | Existing Firebase Spark rules/indexes/Hosting and Render Free API deployed under chiplusmoney. Canonical Worker and 30-minute cron preserved. |
| Identity/privacy | Google sign-out masks records/avatar; return restores the same UID, avatar, proof and applications. Own profile/proof 200; anonymous and other-UID private reads 403; anonymous personal API 401. |
| Earning profile | Known NG and Africa/Lagos persisted. Other qualifications/documents remain unknown. No-document shortcut previewed then restored without persisting guessed availability. Learning reset and notification preferences persisted. |
| Proof | One genuine owner-operated project linked to the repository; AI assistance explicitly credited, no invented skills or certification. Capability card retains provenance. Selected HTML portfolio downloaded and inspected: 1,149 bytes. |
| Fit | Global rank retained. Existing senior role remains Saved with Personal Fit 0 due to location conflict. Remote Office Assistant shows fit 20 with unknowns and a full-eligibility source-review caveat. Missing evidence yields an honest empty confirmed-no-document filter. |
| Preparation | Real listing remotive:1680495 saved and moved to Preparing through the authenticated API; genuine notes, one proof attachment and 17 October follow-up persisted. No application submitted. Opening an official link does not mark Applied. |
| Grounded drafts | Useful suggested templates plus explicit genuine-proof selection. Source facts, user declarations and suggestions remain separate. Real AI endpoint unconfigured; deterministic fallback verified. Nothing sent to employers. |
| Earnings | Actual **$0.00, zero receipt documents**. One Saved, one Preparing, zero Applied/Paid. Advertised values remain potential, grouped by currency and period; no simulated trend/history. |
| Export | Downloaded version-2 account JSON: 5,337 bytes, one proof, two applications, zero earnings, one proof attachment. Credential-field scan found none. Private export excluded from source/ZIP. |
| Offline | One session notes draft queued in RAM, synced after reconnect and persisted after reload. Full offline reload serves 50 public cards; private earnings fails honestly instead of claiming empty. Post-fix offline reload served the final bundle and v2 cache; reconnect recovered. |
| Responsive | Desktop 1440x1000, tablet 820x1180 and mobile 390x844 visually inspected. Avatar ArrowDown/Escape/focus restoration passed. No duplicate Profile or removed slogan. Final mobile detail width/scrollWidth both 390, without temporary inline styles. |
| PWA fix | Live acceptance found stale route HTML from HTTP cache. Hosting now sends no-cache; SW navigation revalidates and installation reloads the shell. Cache ntk-income-hunter-m6-v2; final bundle index-BXiREQfb.js. No browser-cache purge used to hide the defect. Authenticated evidence hash overflow corrected in deployed CSS. |
| Scheduler | Actual cron-30m run run_2026-10-16T06:30:27.718Z: three due permitted sources, 127 published, 11 drafts, 291 rejected, 257 writes, zero failures/invalid writes, no AI. Legacy invalid-credential attempts remain rejected. |
| Security | Emulator tests cover UID isolation, owner-forged payments/lifecycle, forged proof verification, imported proof protection, payment dedupe, learning isolation and notification dedupe. Source/bundle pattern scan passed; final builder scans reachable Git history and ZIP entries. |
| Performance/cost | 5,000 synthetic records: slowest warm local ranking ~108 ms. Main bundle 942,861 bytes / gzip 284,006; CSS 14,805 bytes. No mobile CPU certification. Spark, Render Free, canonical free Worker, paid-AI-disabled; no billing change. |

Evidence: verification/m6-live.json, m6-build.json, m6-personal-fit.json, m6-proof-builder.json, m6-outcome-learning.json, m6-security-rules.json, m6-browser-acceptance.json and m6-performance.json. Screenshots: m6-desktop.png, m6-tablet.png, m6-mobile.png and m6-mobile-fit.png.

Limitations: sparse owner profile; real AI endpoint unconfigured; accurately user-declared proof; RAM-only private drafts; personalized notifications opt-in and bounded (10 users, 100 newest rows/pass), disabled during acceptance. No extra Telegram test sent. Genuine submitted/paid import verified in emulator rather than inventing production outcomes. Historical unrelated Firebase CLI OAuth cleanup remains owner action: OAUTH_SECURITY_ACTION.md.

Rollback: preserve new private records and prefer a forward fix, or coordinate M5b client/API/rules checkpoint. Never restore an old scheduler credential or inaccessible Worker. The accepted M5b ZIP moves intact to ARCHIVE only after the verified replacement is ready.
