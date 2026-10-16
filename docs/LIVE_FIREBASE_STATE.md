# Live Firebase state

Date: 2026-10-16. Project: `ntk-income-opportunity-hunter` (813703245101), existing Spark project; no billing change. Other Firebase projects were untouched.

| Path | Current authorization / data |
|---|---|
| `opportunities/{id}` | Public read only for published records. Ordinary clients cannot write; privileged admin claim / Admin SDK is trusted. |
| `opportunityEvidence/{id}` | Authenticated read. Ordinary clients cannot write; privileged admin claim / Admin SDK is trusted. It is not public. |
| `internalSourceRuns/{id}` and `internal/**` | Denied to client SDK accounts. Server-only audit/state/notification attempt records. |
| `users/{uid}` | Only that authenticated UID may read or write its own profile. |
| `users/{uid}/{saved,applications,earnings,syncQueue}/{id}` | Owner only. No cross-account access. |
| `users/{uid}/notifications/{id}` | Owner may read/delete or change only the Boolean `read` field. Client creation is denied. Server creates receipts. |

The canonical `firestore.rules` were reviewed and deployed on 2026-10-15. Fresh probes on 2026-10-16: public catalog 200; evidence anonymous 403 / owner 200; profile anonymous 403 / owner 200; owner earnings 200; every tested other-UID collection 403; forged notification creation 403. See `verification/live-security.json`. Emulator coverage: 29 passing tests.

One genuine live opportunity was saved in the owner's account. Profile country and skills persist in Firestore. No applied/accepted/paid status was manufactured, and actual earnings remain zero. Paid transaction and duplicate tests use only the emulator.

Email/password signup and sign-in plus Google were exercised live; Google retained the same UID while replacing the unverified password provider. Current owner sign-in method is Google, not assumed dual linkage.

Render's mounted `/etc/secrets/firebase-service-account.json` is preserved and works: readiness makes an actual server read. The unnecessary downloaded service-account JSON was removed and its absence rechecked. No private key is packaged. Auth session persistence is distinct from backend credentials; the app retains the owner's normal Firebase session on their device.

The custom persistent cache contains only public opportunities. Current Firestore private reads use memory. The obsolete Firestore persistent cache on the tested Neo origin was removed after verifying zero pending mutations; Auth storage was preserved.
