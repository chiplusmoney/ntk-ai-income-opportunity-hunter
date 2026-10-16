# M7 production acceptance — v0.6.0

Runtime gates: VERIFIED. Final overall verdict is package-gated: `M7_OPPORTUNITY_COVERAGE_AND_SMART_ALERTS_VERIFIED` is issued by the finished archive's `M7_PACKAGE_ACCEPTANCE.json` only after CRC, source/history/ZIP credential scans and independent measurement. The source runtime receipt deliberately says `LIVE_GATES_VERIFIED_PACKAGE_PENDING`.

## Production result

The existing canonical Worker invoked the existing Render API at `2026-10-16T08:00:28.013Z`, reason `cron-30m`. The real run finished at `08:00:43.393Z`: two due sources (Jobicy, We Work Remotely), 100 fetched, 82 accepted through verification (including seven drafts), 18 rejected, 75 published, zero invalid writes and zero failed writes. AI was not attempted. The API logged 152 validated catalog/evidence/run writes; the intelligence receipt measured another 79 internal identity/health/yield writes, giving 231 measured ingestion writes. Lease/schedule/notification writes are separate. No queue overflow remained.

New public records: 40 Jobicy and 35 WWR. Categories: 23 Development, 45 Other, 3 Design, 1 Testing, 3 AI Training. Ten confirmed $0, 65 unconfirmed-cost; 21 with structured advertised reward, 54 reward unknown. Thirty-seven explicit GLOBAL tags; country tags overlap and never confirm complete work authorization. No source reward was recorded as income.

Before/after public live sources: **4 → 6**. Registry/adapters: nine total, six serving public scope, three prohibited/restricted. Candidate references do not count as live sources. Expansion is two additions rather than the preferred 6–12 because permission overrides quantity. See [qualification review](M7_SOURCE_EXPANSION.md) and [source-yield review](M7_SOURCE_YIELD_REVIEW.md).

The other four sources were not forced to run. Their actual dated M6 crawl counts appear in Source Health, while unmeasured new quality fields remain null/“Not measured” until due. Remotive retains six hours; Remote OK/GitHub hourly; Arbeitnow is reduced to six hours after the measured 13/300 accepted low-yield run. New feeds next due at `14:00:28 UTC`. Technical availability never enables prohibited content.

## Release and resource identity

- Hosting: https://ntk-income-opportunity-hunter.web.app
- API: https://ntk-hunter-api.onrender.com (`/ready` 200, real Firestore server read, live/public, scheduler credential configured).
- Worker: https://ntk-income-opportunity-hunter-scheduler.chiplusmoney.workers.dev — existing version `add14e17-4051-4672-8275-34c7c4f0d000`, every 30 minutes; public `/run` absent.
- Firebase project `ntk-income-opportunity-hunter`, Spark verified in the owner console. Render service `srv-db8btdvavr4c73av54vg`, Free verified live. Cloudflare existing account/Worker, encrypted scheduler binding retained. No resource recreation or billing changes.
- Real AI unconfigured, paid AI false. No source subscription, Telegram service subscription or new credential.
- Application releases `70ac275`, `9671964`, `224d314`, `0b3cb82`, `3d3c717` observed through the existing auto-deploy. Final Git/package revision is measured in the outer metadata; later documentation does not change the hosted assets. Final browser assets: `index-jaddVy9t.js`, `index-mU3__Gtz.css`, lazy `SourceHealth-WUUOu-lL.js`.

The legacy orphaned Worker still attempts its old invalid credential; Render rejects it. It is not canonical and was not restored or used for acceptance. The canonical valid run succeeds independently.

## Tests and security

**615 unit cases**: core 434, web 83, API 85, scheduler 9 (611 Vitest), plus four Node rate-cache guards. **64 real emulator/security cases**. **Eight permitted live-source cases**. Zero dependency audit vulnerabilities. Clean install, typecheck, build passed; no accepted M6 test was deleted or weakened. Explicit registry expected-source lists were extended to the two new reviewed grants; the personal-scope test explicitly lifts its batch cap to test all seven servable sources.

`m7-clean-suite.json` is the simultaneous clean-install receipt (611 unit/eight live/56 emulator at that point). `automated.json` preserves it and adds later appropriate follow-ups: 64 emulator/security, four Node guards, final quality cadence/typecheck/build, UI text/grid fixes. Do not present all totals as one simultaneous cold run. Logs are local ignored files; structured receipts contain the portable counts and timestamps.

Persistent dedupe, stronger-evidence replacement, secondary provenance, stable original IDs, re-crawl discoveredAt preservation, queue resumption/cap, cross-instance lease, source reservations, owner-only operations, malformed policy, opt-in, quiet hours, digest cap/daily uniqueness, durable attempt dedupe and ambiguous Telegram behavior were exercised against the real Firestore emulator. No live synthetic payment/application/outcome was created. Live read-only security: owner operations 200/no-store; anonymous operations 401; other UID profile 403; internal cursor 403. Internal M7 paths remain denied by rules.

No prohibited source endpoint was contacted. A distinct development polling-clock defect was found: qualification/live verification and production were not initially coordinated, producing overly close Jobicy requests. This is documented candidly in the source review. Corrective guards now persist responses/attempts across verification runs and consult production receipts; four offline tests verify the guard. No further provider probes followed discovery. Production scheduling already reserves each source interval durably. Historical perfect polling compliance is not claimed.

## Alerts, privacy and owner state

Opt-in policies, filters, instant/daily digest, local quiet hours/day counters, <=3/day, >=6h cooldown, bounded source/user/catalog/attempt work and a resumable user cursor are deployed. Production notification pass at `08:00:43.394Z` found **zero opted-in users and wrote zero notices**. Disabled digest preferences were saved through the real UI and reloaded. Telegram remains off. No additional live message was sent; existing accepted bot delivery evidence is retained, and new dispatch uses mock transport/emulator tests.

The in-app notification center has unread count/read/unread/delete and details for server-created notices. Its production empty state is genuine; populated delivery/digest and delete-dedupe behavior are emulator-proven, not falsely described as live owner deliveries. Deleting a receipt cannot delete the permanent attempt ledger. Only the configured owner can use the connected Telegram destination; tokens/destinations remain server-only.

Owner profile remains two of ten matching basics, NG/Africa-Lagos; skills/CV/portfolio/experience are not invented. One genuine user-declared project proof remains. Two applications remain one Preparing and one Saved. **Actual receipts: zero; actual income $0.00.** Genuine proof selection and grounded preparation still work; no external submission or employer message was made.

## Neo and PWA acceptance

BrowserOS Neo/chiplusmoney only. Dashboard, Explore, detail/Personal Fit, Proof Builder, application preparation, Source Health, policy/digest settings, notification center, earnings, profile/avatar and security menu checked. Real avatar and advanced dropdown preserved; Escape restores focus; duplicate Profile navigation count zero; removed slogan absent.

Desktop 1440×1000, tablet 820×1180 and mobile 390×844 inspected. Mobile source health: 390 document/viewport width, zero overflowing controls; tablet source cards align at the same top coordinate. Native screenshots stored in verification. An actual mojibake defect was found in UTF-8 labels, fixed, deployed and verified. Grid margins were corrected and rechecked.

Offline hard reload: 50 public cached opportunities with honest offline banner and current application bundle. Private notification hard reload: unavailable state, no fabricated empty ledger. Reconnect: true server empty state and avatar recover. Only `ntk-income-hunter-m7-v1` cache remains; no cache purge was used to conceal stale HTML. The latest navigation loads the current hashed bundle.

## Limits and continuing operation

New source production counts are one real M7 run, not a long-term quality claim. Other sources' M7 quality fields populate at their due interval; dated legacy data is labelled. Whole-source Personal Fit/application/paid-outcome yield is not manufactured; the current device catalog fit snapshot is separate. Profile incompleteness can leave strong-fit alerts empty. Notifications remain owner opt-in. No paid research/Web3/grant integration was forced through an uncertain grant.

The first live M7 run contained no cross-source duplicate, so live duplicate count is correctly zero; genuine mirror/richer-evidence/cross-restart behavior is emulator-proven. No fabricated duplicate or outcome was injected into production for a positive-looking metric.

Free-tier bounds intentionally limit throughput: two users/pass, 100 recent plus up to 50 saved records/user, 50 applications/20 proofs per user, one delivery/user/pass. Large private histories skip rather than pretend complete; user count increases evaluation latency. Main bundle remains above 500 kB uncompressed. Internal run/attempt/provenance storage grows and needs a future retention policy at sustained scale. No private record was deleted to reduce cost.

Unrelated historical Firebase CLI OAuth revocation remains an owner-security action; do not switch accounts to perform it. See `OAUTH_SECURITY_ACTION.md`. It does not block this project.
