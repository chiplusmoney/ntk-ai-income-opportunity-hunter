# M5b production hardening — current state

Date: 2026-10-15 (Africa/Lagos). Revision: 0.4.1. M6 is excluded.

Verdict: **PARTIAL — HARDENING AND LIVE ACCEPTANCE IN PROGRESS**.
The earlier full-acceptance verdict is withdrawn. It must not be used until every requested gate has direct evidence.

## Verified so far

- Canonical repository and Render service preserved; rollback source branch `m5b-pre-hardening-20261015` identifies the starting source.
- Firebase Email/Password and Google providers enabled in the existing dedicated project.
- Real owner Email/Password signup, rejected wrong password, email sign-in, sign-out and Google sign-in exercised in Neo. Google retained the same Firebase UID; credentials are omitted.
- Profile and one genuinely saved live opportunity persist in the owner's account. No applied, accepted, submitted or paid claim was invented in production.
- Empty live earnings show zero, no success percentage, no invented history.
- Canonical source disables every HTTP manual scheduler trigger (Option A). Source tests prove all `/run` credentials are rejected and cron forwards the internal credential.
- Current deployed Firebase rules require authenticated evidence reads. Public-evidence documentation was wrong. Reviewed rules additionally restrict notification updates to a Boolean `read` field and were deployed.
- Public catalog data stays browseable signed out. Private Firestore documents use memory caching; authenticated evidence is excluded from the persistent public cache.
- Dependency patch moves gRPC to 1.14.6; audit reports zero vulnerabilities.

## Gates still pending

- Cloudflare account access: the only accessible chiplusmoney account currently lists zero Workers. Owner is granting access to the authoritative existing scheduler account. No Worker was recreated and no other account used for deployment.
- Complete and verify matching secret rotation on Cloudflare, old-secret rejection, live disabled `/run`, internal cron authentication and a repeat hunt.
- Telegram token setup, private destination verification, exactly one provider-confirmed owner message, server receipt, and live mark-read/delete.
- Final source deployment, repeat security/emulator checks, responsive/offline acceptance and final independent package verification.
- Verify the Render mounted service account by an actual server read before removing its unnecessary local download.

## Security incident note

A Firebase CLI account-list diagnostic using JSON unexpectedly emitted cached OAuth credentials for an unrelated CLI account into the execution transcript. Those credentials were not used for production operations, were not copied into source or artifacts, and are not repeated here. This diagnostic exposure is separate from the previously exposed scheduler credential. Revoking that unrelated account's CLI authorization requires its owner/account authority; this pass is restricted to chiplusmoney. Do not claim the transcript is credential-free.

## Cost and scope

Reuse Firebase Spark, existing Render and Cloudflare resources. No billing change, replacement resource, M6 work or fabricated production payments is authorized. Read/write tests are bounded. Any incomplete gate keeps the verdict narrower than full M5b live acceptance.
