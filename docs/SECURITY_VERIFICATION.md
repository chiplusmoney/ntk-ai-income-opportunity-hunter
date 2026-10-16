# M5b final security verification

Date: 2026-10-16. Project verdict: **M5b_LIVE_DEPLOYMENT_AND_ACCEPTANCE_VERIFIED**. Unrelated OAuth action remains explicitly open.

- Fresh cryptographic scheduler value is synchronized in Render and the canonical Cloudflare encrypted secret_text binding. No previous literal value was recovered or reused. Fresh /internal/status is 200; missing and invalid credentials are 401.
- Actual legacy invalid-credential rejections are visible in Render, including the bounded manual probe at 02:07 UTC. The middleware maps that result to 401; the legacy Worker's external response is 500/1101. Its prior credential cannot authorize a hunt.
- New public POST /run returns 404. Actual scheduled invocations succeed with matched Cloudflare and Render run IDs. Provider module readback matches the tested hardened build.
- Fresh live Firestore probes: anonymous published catalog 200; anonymous evidence/profile 403; owner evidence/profile/earnings 200; all tested other-UID private collections 403; forged notification creation 403. 29 emulator/rules tests pass.
- One saved application remains saved; no production payment was fabricated. Deterministic source:item IDs have zero duplicate stable keys in the 184-document bounded public read; three fresh source/evidence pairs match the 02:17 run. Writer replay/atomic payment/duplicate rejection tests use the emulator.
- Telegram credentials and mounted service-account file are preserved server-side. No extra Telegram message was sent. Actual existing bot delivery remains visible; current session confirms it is one delivered bubble plus its chat-list preview, not two sends.
- Private Firestore data remains in memory; persistent opportunities are public. Offline private masking and reconnection pass. Field-selected export and account isolation are preserved.
- Dependency audit: zero vulnerabilities. Pattern scans cover current source, bundles, docs, reachable Git blobs and all final ZIP entries; exact metadata is generated at packaging. Public Firebase configuration and normal owner Auth persistence are intentionally allowed. Pattern scans do not prove absence of every possible secret encoding.

**OWNER SECURITY ACTION STILL REQUIRED:** the earlier exposed Firebase CLI OAuth grant belongs to a different cached Google identity. No switch to that account or credential use was authorized by the chiplusmoney-only rule. Its owner should revoke the Firebase CLI connection in their own Google Account security settings, then reauthorize only when needed. See OAUTH_SECURITY_ACTION.md. No credential content is recorded; do not call the earlier execution transcript credential-free.

Final new-credential browser audit: 11 cached responses, 3 IndexedDB databases/stores and 52 records plus localStorage were checked; no current scheduler credential or private-key marker was found. Auth persistence remains intentionally active. See verification/browser-cache-final.json.
