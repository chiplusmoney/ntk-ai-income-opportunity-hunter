# Live deployment receipt — M5b hardening

Date: 2026-10-16. Version: 0.4.1. **PARTIAL: Cloudflare access blocked.**

| Resource | Verified current state |
|---|---|
| Firebase Hosting `ntk-income-opportunity-hunter.web.app` | Updated profile/avatar/settings UI deployed and checked live in Neo |
| Render `ntk-hunter-api`, service `srv-db8btdvavr4c73av54vg` | Hardened readiness, rotated server credential, owner Telegram transport deployed |
| Firestore `ntk-income-opportunity-hunter/(default)` | Existing database preserved; reviewed owner-isolation and notification rules deployed |
| Cloudflare `ntk-income-hunter-scheduler.ntk-note.workers.dev` | Existing health navigation returned 200 with `hunter-scheduler`; hardening source NOT deployed |

Render `/ready` returns 200, mode `live`, scope `public`, with a real server Firestore read succeeding and paid AI disabled. No cloud resource was recreated and billing was not changed.

Fresh Render secret works. The old value returned 401 in the direct rotation check. Cloudflare's encrypted value has not been updated because chiplusmoney cannot access the owning account. Successful scheduled authenticated execution is not claimed.

A protected administrative hunt completed at 2026-10-16T01:17:41.945Z: 136 published, 17 drafts, 276 documents written, zero failed writes. The immediate repeat wrote zero and skipped every source by its interval. These are counts for the run, not total database counts. No interval was forced. See `verification/hunt.json`.

Firebase and GitHub operations used the explicitly authorized chiplusmoney identity. Other globally cached CLI accounts were not used for deployment or push. No credentials are included in this receipt.

Rollback: `m5b-pre-hardening-20261015` preserves the starting source. Preserve mounted Render secrets and real user data; never restore an exposed credential. Do not redeploy the older public manual-trigger implementation.
