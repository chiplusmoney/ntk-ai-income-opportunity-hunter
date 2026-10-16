# Security verification — M5b hardening

Date: 2026-10-16. **PARTIAL: Worker hardening deployment blocked.**

## Verified boundaries

- Render uses a fresh cryptographic shared credential. Direct rotation probes: old value 401, fresh value 200. Values were not written to source, receipts or the package.
- Reviewed Firebase rules deployed. Current live tests: anonymous published catalog 200; anonymous evidence/profile 403; owner evidence/profile/earnings 200; all tested other-UID private paths 403; forged notification creation 403.
- Notification edits are limited to Boolean read status. Real mark-read/delete passed. A server-only permanent send-attempt ledger prevents a deleted receipt from authorizing another message.
- Telegram token/destination and Firebase service account remain on Render only. The mounted service-account file is working; its unnecessary local download is absent.
- Public-only persistent PWA cache. Private Firestore documents use memory. Offline private views do not present empty cache as actual zero records. Legacy persistence was removed only after zero pending mutations; normal owner Auth persistence was preserved.
- Export selects explicit fields rather than serializing Auth or raw Firestore objects. Unit test injects sensitive marker fields at multiple levels; they are excluded. Real export had no credential fields.
- 29 emulator/security tests pass; dependency audit reports zero vulnerabilities. Source/history/bundle/documentation and final ZIP pattern scans are measured by the packaging tool. A broader 375-file WORKING scan (excluding dependencies, Git internals and binary images) found no private credential patterns.

## Incomplete boundary

Cloudflare's encrypted secret cannot yet be matched to Render, and source removal of public `/run` cannot be deployed. Only one account is accessible to chiplusmoney, with zero Workers and zero pending invites; owning-account access returns 403. The compromised credential remains rejected by Render, so that old Worker cannot authenticate. No replacement account or resource was created.

## Scope of scanning and incident

The scanner checks private-key blocks, GitHub/Telegram/Google OAuth/Render token shapes, literal bearer tokens, secret assignments including Cloudflare, and the fresh scheduler-value shape. It scans tracked/new files, frontend output and all reachable Git history, then every final ZIP entry. Public Firebase web identifiers are intentionally allowed. Pattern scans are evidence of their stated checks, not a proof against every possible secret encoding. The browser cache was also checked against the actual current scheduler credential and PEM markers; none were found. A final scan of every current-origin IndexedDB store and localStorage likewise found neither a private-key block nor the current scheduler credential; normal Firebase Auth session persistence is intentionally retained. See verification/browser-storage-security.json.

An earlier Firebase CLI JSON account-list diagnostic emitted unrelated cached OAuth credentials into the execution transcript. They were not used or copied to artifacts. Revocation of that unrelated account was outside this account-restricted pass; the transcript must not be described as credential-free.
