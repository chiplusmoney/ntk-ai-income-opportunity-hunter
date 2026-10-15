# AutoClaw Task Queue

- [x] M0 Repository + visual-reference scaffold
- [x] M1 Responsive UI shell prototype
- [x] M1 Offline cache + service worker foundation
- [x] M1 Cloudflare scheduler foundation
- [x] M2 Firebase config + Firestore repository/rules foundation
- [x] M3 Source Registry + first 4 live adapters
- [x] M3 Evidence capture + deterministic verifier (evidence, eligibility, zero-capital, risk, dedupe, scoring)
- [x] M3 Firestore document contract + validator
- [x] M4 Zero-capital status contract (`confirmed_free` / `unconfirmed_no_cost_found` / `capital_required`) through core, Firestore, cache and UI
- [x] M4 Pinned dependency versions + Node runtime declaration
- [x] M4 Hunter API service (health/ready, authenticated triggers, status, single-flight, interval-aware planning)
- [x] M4 Firestore server writer (Admin SDK, validated, deterministic ids, idempotent, audit trail)
- [x] M4 Firestore emulator integration test (source → adapter → verification → document → read back)
- [x] M4 Profile contract + validation + persistence layer
- [x] M4 FlagshipRouter capability routing + provider-pool adapter + AI analysis safety
- [x] M4 Source compliance review; HN enabled, Devpost and Freelancer prohibited
- [ ] M2 Real authentication in a live Firebase project (email/Google sign-in end to end)
- [ ] M4b Owner gates: deploy the API to Render, deploy rules/indexes, prove one live Firestore write
- [ ] M4b Apply the worker wiring patch (`docs/WORKER_WIRING_PATCH.md`) once the guard false positive is resolved with the owner
- [ ] M4b Browser/PWA acceptance: mobile, tablet, desktop, installed PWA, online→offline→reconnect
- [ ] M5 Email/Telegram/Push notifications
- [ ] M6 Applications, earnings and proof-builder persistence
- [ ] M7 Full browser/offline acceptance across devices

## Standing verification (run before every handoff)

```bash
cd WORKING
npm run typecheck
npm test
npm run build
npm run verify:live       # real provider probes
npm run verify:emulator   # Firestore emulator integration
```
