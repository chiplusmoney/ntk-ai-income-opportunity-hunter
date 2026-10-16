# M5b final build receipt

Date: 2026-10-16. Version 0.4.1. Verdict: **M5b_LIVE_DEPLOYMENT_AND_ACCEPTANCE_VERIFIED**.

Machine report: verification/automated.json, generated 2026-10-16T02:40:19.474Z using v24.20.0.

| Check | Measured result |
|---|---|
| Clean npm ci | PASS |
| All workspace typechecks and build | PASS |
| Core unit tests | 319 passed; 8 live cases run separately |
| Web unit tests | 74 passed |
| API unit tests | 77 passed; 29 emulator cases run separately |
| Scheduler unit tests | 9 passed |
| Total ordinary unit tests | 479 passed, 0 failed |
| Permitted-source live checks | 8 passed |
| Emulator pipeline, rules and actual frontend ledger transaction | 29 passed |
| Dependency audit | Zero vulnerabilities |

The scheduler tests cover public trigger rejection, secret forwarding, no authentication retries, selected credential-free audit logging, busy outcomes and malformed success responses. Provider readback of the deployed module matches this tested compiled JavaScript exactly.

The frontend is unchanged during closure and its built assets match the prior approved build. The entry remains approximately 891 kB / 271 kB gzip; the existing bundle-size advisory and dependency use-client directive warnings are not a performance certification. Emulator payment fixtures do not enter production.

Real production proof is separate: scheduled-chain.json, cloudflare-due-hunt.json, render-scheduled-hunt.json, firestore-persistence.json and current live security receipts. Final archive bytes, entries, SHA-256, source commit and recomputation are calculated from the completed ZIP in external package-verification.json.

The full clean verification was repeated after the restored production cron itself completed successfully; this is the final post-closure run.
