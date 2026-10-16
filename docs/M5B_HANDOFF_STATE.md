# Self-contained M5b hardening handoff

Date: 2026-10-16. Version 0.4.1. Verdict: **M5b_PARTIAL_CLOUDFLARE_ACCESS_BLOCKED**. Do not use the full live-acceptance verdict. M6 is excluded.

This is an existing React/Vite/Firebase PWA and Node Hunter API. The deterministic core reads permitted feeds, captures evidence, filters and ranks public opportunity records in Firestore. Render runs the API; a pre-existing Cloudflare Worker is intended to trigger it on a 30-minute cron heartbeat, while the API enforces individual source intervals.

## Current deployed behavior

Hosting: https://ntk-income-opportunity-hunter.web.app
API: https://ntk-hunter-api.onrender.com
Existing Worker: https://ntk-income-hunter-scheduler.ntk-note.workers.dev
Firebase project: ntk-income-opportunity-hunter; no other project is part of this release.

The top real avatar is now the single profile entry. Its working dropdown contains profile, security, settings, notifications, field-selected data export and sign-out. Sidebar and mobile navigation contain Settings, not Profile. The footer slogan is gone. Actual Google identity and sign-in security appear in Profile; country/skills persist in Settings.

Authentication and private UID-scoped saved/application/earnings/notification data are real. One live opportunity was genuinely saved. Earnings are actual recorded receipts only: the owner currently has zero. Payment transaction and duplicate tests run only in the emulator; no paid record was fabricated in production.

Telegram delivered exactly one controlled test at 2026-10-16T01:14:54.136Z, message ID 5. The owner chat was independently matched to the signed-in Neo Telegram identity before sending. Provider confirmation, visible message and in-app mark-read/delete all passed. A permanent server-only attempt ledger prevents a second send. Broader automated opportunity notification delivery, email and push are not claimed.

## Verification

Clean install, typecheck, build and audit pass. Ordinary unit tests: 476 passed, zero failed; 8 permitted-source checks and 29 emulator/security tests pass separately. See verification/automated.json. Fresh live rules probes prove signed-in evidence, owner-private access, other-UID denial and client notification-creation denial. Render readiness performs a real Firestore read.

Final bounded hunt: 136 published, 17 drafts, 276 writes, zero failures. Immediate repeat: zero writes, all sources correctly interval-skipped. These are per-run figures, not total database counts. Forbidden sources were not contacted.

Desktop, tablet and mobile screenshots were inspected. The actual avatar loads. Native menu arrow/Escape/sign-out, Google return and saved preferences pass. Public offline full reload shows 50 cached opportunities; private data asks for reconnection and recovers online. Legacy Firestore cache was removed after checking zero pending mutations, preserving Auth persistence.

The unnecessary local service-account download is absent. Render's mounted Secret File is preserved and working. Secret scans cover current source, bundles, docs, reachable Git blobs and final ZIP. Metadata is computed after ZIP creation and independently recomputed; exact filename, bytes, entry counts, SHA-256 and source commit are external in package-verification.json, avoiding a circular ZIP self-hash claim.

## Outstanding Cloudflare gate

Render's compromised shared secret has been rotated; the old returns 401, the fresh returns 200. Canonical Worker source removes all HTTP /run triggers (Option A), and six scheduler tests pass. However, the existing Worker belongs to Cloudflare account bf704dfd0ec55748ffa95a10b414b2b0, which chiplusmoney cannot access. The sole accessible account 4f67a960d66dff69c2fcab490616c811 has zero Workers. No pending invite or matching invitation email was found; owning-account request returned 403.

Therefore the encrypted Cloudflare secret, hardened Worker deployment and authenticated cron-to-Render execution remain incomplete. Do not recreate the Worker, use a different account or restore the compromised value. Resume by giving chiplusmoney access to the existing owning account, update that Worker's encrypted secret to match Render without exposing it, deploy canonical source, verify public /run is unavailable and confirm authenticated cron execution. Repackage with fresh measured evidence afterward.

## Scope, cost, security and rollback

No resource recreation, billing change, paid AI call or M6 work. Source rollback branch is m5b-pre-hardening-20261015 at a66532d, but never restore an exposed secret or older public manual trigger. Real user records and mounted credentials are preserved.

The AI assistant remains an existing interface scaffold, not a verified analysis service. Physical device testing and performance certification are not claimed; the built client entry is about 271 kB gzip.

An earlier Firebase CLI JSON diagnostic emitted unrelated cached OAuth credentials into the execution transcript. They were not used or copied to artifacts. Revocation was outside this account-restricted pass and remains an account-owner action. Do not describe the execution transcript as credential-free.
