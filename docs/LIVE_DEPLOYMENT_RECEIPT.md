# Live deployment receipt - final M5b

Date: 2026-10-16. Version 0.4.1. **M5b_LIVE_DEPLOYMENT_AND_ACCEPTANCE_VERIFIED**.

| Resource | Current authoritative deployment |
|---|---|
| Firebase Hosting | https://ntk-income-opportunity-hunter.web.app - approved UI preserved and rechecked |
| Firebase | ntk-income-opportunity-hunter, existing Spark database/rules/data preserved |
| Render | https://ntk-hunter-api.onrender.com, service srv-db8btdvavr4c73av54vg - live Firestore readiness and fresh authentication verified |
| Canonical Cloudflare Worker | https://ntk-income-opportunity-hunter-scheduler.chiplusmoney.workers.dev, account 4f67a960d66dff69c2fcab490616c811, Workers Free |
| Cron | */30 * * * *; temporary proof interval restored at 02:09:56 UTC |

The canonical Worker module matches the tested build. Its health returns 200 and unauthenticated POST /run returns 404. Handler configuration includes scheduled and fetch; the fresh shared value is an encrypted secret_text binding. No paid subscription, add-on or billing upgrade was created.

Scheduled event proof: Cloudflare outcome ok, origin scheduled, same run ID as Render. Due run run_2026-10-16T02:17:09.869Z wrote 259 documents (128 published plus their evidence and 3 source audits), with zero failures and no AI. Next scheduled run at 02:18 wrote zero. Source audit times were read back from Firestore and fresh evidence pairs independently read with the owner session.

Legacy only: https://ntk-income-hunter-scheduler.ntk-note.workers.dev is **LEGACY_ORPHANED_WORKER - INACCESSIBLE - CREDENTIAL INVALIDATED - NOT CANONICAL**. Its periodic/manual attempts log invalid-credential in Render (middleware returns 401); its own wrapper returns 500/1101. The inaccessible account was not modified.

Rollback source: m5b-pre-canonical-scheduler-20261016. Preserve the new Worker ownership/name, fresh secret synchronization, mounted service-account file and production records. Never redeploy the old public-trigger implementation or restore prior credential values.

Final regular-cron confirmation: actual provider event `*/30 * * * *` completed at 2026-10-16T02:30:27.919Z (03:30 Lagos). Cloudflare and Render match `run_2026-10-16T02:30:27.644Z`, zero writes, zero failures. The last observed short-interval propagation event was 02:21 UTC; the regular production cadence is now proven. See verification/regular-cron.json.
