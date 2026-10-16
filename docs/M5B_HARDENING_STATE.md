# M5b hardening state

Date: 2026-10-16 (Africa/Lagos). Version: 0.4.1.
Verdict: **M5b_PARTIAL_CLOUDFLARE_ACCESS_BLOCKED**. M6 has not started.

The earlier full production-acceptance verdict is withdrawn. Current source and receipts replace those unsupported claims.

## VERIFIED

- Render's compromised shared credential was replaced with a cryptographic value. The old credential returned 401 and the fresh credential returned 200. Values are omitted everywhere.
- Firebase Hosting serves the corrected interface: one working top avatar dropdown, actual account photo, Settings in navigation, no duplicate Profile item, and no footer slogan.
- Email/password signup, rejected wrong password, email sign-in, sign-out and Google sign-in were exercised in the live app. Google retained the owner UID. The current owner provider is Google; password linkage is not assumed.
- Private account subscriptions and writes are scoped by UID. Real saved work persists. Earnings derive only from explicit actual payments. No production payment or application outcome was invented.
- Telegram delivered exactly one controlled message; it was visible in the signed-in owner's Telegram, recorded server-side, marked read and deleted in the app. A permanent server-only attempt ledger prevents another send after receipt deletion.
- Reviewed Firebase rules were deployed; fresh live probes and 29 emulator tests pass. Evidence requires sign-in. Anonymous public catalog reads remain permitted.
- Clean install, typecheck, 476 unit tests, build, 8 permitted-source checks, 29 emulator/rules tests and dependency audit pass. Audit: zero vulnerabilities.
- A due-source live hunt wrote 276 documents without failures. Immediate repeat wrote zero and respected crawl intervals.
- Desktop, tablet and mobile inspection pass. Offline full reload shows 50 cached public opportunities; private views fail honestly until connection returns.
- Render's mounted service-account file performs a real Firestore read. The unnecessary downloaded local JSON was removed and absence rechecked.

## BLOCKED / NOT VERIFIED

The existing Worker belongs to a different Cloudflare account than the only account available to chiplusmoney. Accessible account inventory: zero Workers; pending invitations: zero; request to the owning account: HTTP 403. A targeted invitation search in the signed-in mailbox returned no matching message.

No Worker or account was recreated. The canonical source removes HTTP `/run` entirely (Option A), with six scheduler tests passing, but that source could not be deployed to the existing Worker. Matching encrypted-secret rotation and successful cron-to-Render execution are therefore **not complete**. Old scheduler credentials cannot authorize Render.

Access needed to close this gate: give the existing chiplusmoney identity permission to manage `ntk-income-hunter-scheduler` in its owning Cloudflare account, then deploy the existing source and update its encrypted secret to match Render. Do not restore the compromised value or use another account as a workaround.

## Security incident

An earlier Firebase CLI JSON account-list diagnostic unexpectedly emitted cached OAuth credentials for an unrelated CLI account into the execution transcript. Those credentials were not used, committed or copied into artifacts and are not repeated here. Revocation of that unrelated account was outside this account-restricted pass. Do not claim that the transcript is credential-free.

## Preservation and handoff

Existing Firebase, Render and Cloudflare resources were reused; no billing change or paid AI call. Rollback source: local branch `m5b-pre-hardening-20261015` (a66532d). Never roll back to the compromised secret or earlier weak Worker behavior. Current evidence is under `docs/verification`; exact final ZIP measurements and source commit are in the external `package-verification.json` generated after packaging.
