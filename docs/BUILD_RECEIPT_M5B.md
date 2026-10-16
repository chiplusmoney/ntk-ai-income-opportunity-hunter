# M5b hardening build receipt

Date: 2026-10-16. Version: 0.4.1. Verdict: **M5b_PARTIAL_CLOUDFLARE_ACCESS_BLOCKED**.

Machine-measured results: [automated.json](verification/automated.json), generated 2026-10-16T01:14:01.440Z, Node v24.20.0.

| Check | Result |
|---|---|
| Clean `npm ci` | PASS |
| Typecheck, all workspaces | PASS |
| Core unit suite | 319 passed; 8 live checks skipped here and run separately |
| Web unit suite | 74 passed |
| API unit suite | 77 passed; 29 emulator tests skipped here and run separately |
| Scheduler unit suite | 6 passed |
| Total ordinary unit tests | 476 passed, 0 failed |
| Production build, all workspaces | PASS |
| Compliance-aware permitted-source verification | 8 passed |
| Firestore emulator pipeline, security rules, frontend ledger transaction | 29 passed |
| Dependency audit | Zero vulnerabilities |

The emulator payment fixtures are explicitly synthetic and never enter production. The ledger tests execute the actual frontend transaction against emulator rules, including explicit payment, atomic application/earning persistence, duplicate prevention, no inferred reward, sign-out and offline boundaries.

Build warnings: the client entry is about 891 kB / 271 kB gzip, mostly the Firebase/Auth client stack. The bundler reports its 500 kB advisory and ignored dependency `use client` directives. This is a performance limitation, not a failed build or a claim of performance certification.

Source-only Worker removal of `/run` is tested; live Worker deployment and matching encrypted-secret rotation remain blocked by account access. Automated passing tests do not prove those missing production gates.

Final archive counts, byte size, Git commit and recomputed SHA-256 are generated from the completed ZIP in `HANDOFF_TO_CHATGPT/package-verification.json`. No precomputed or manually carried archive count is used.
