# Live Firebase State — ntk-income-radar

Date: 2026-10-15
Project (owner-approved): **`ntk-income-radar`** — "NTK Income Radar", project number 509949685014
Owner instruction on record: use this project; **do not touch `ntk-api-tester`**.

## What was actually done to the project

| Step | Result |
|------|--------|
| Spark/$0 policy analysis | done — see below; **no Blaze feature, no paid service, nothing enabled** |
| Read-only inventory of existing resources | done |
| `firestore.indexes.json` deploy (merged with the existing indexes) | **DONE — 7 indexes live: my 2 added, the 5 that already existed preserved** |
| `firestore.rules` compile check | **passed** ("rules file firestore.rules compiled successfully") — validation only, **not deployed** |

No rules were deployed, no data was written, no Auth provider was changed, no
Hosting deploy was made, and no resource was deleted.

## Spark / $0 policy analysis

| Service needed | Spark-eligible? | Enabled by this work? |
|----------------|-----------------|------------------------|
| Firestore rules | yes | rules compiled; deployment held (see the collision) |
| Firestore composite indexes | yes | **yes — 2 added** |
| Firestore reads/writes within the free daily quota | yes | not yet (needs credentials) |
| Firebase Authentication (email/password, Google) | yes | not changed |
| Firebase Hosting (10 GB stored, 360 MB/day on Spark) | yes | not deployed |
| Cloud Storage | yes (small free tier) | not used |
| Cloud Functions | **requires Blaze** | **not used anywhere in this project** |
| Paid AI APIs | n/a | `PAID_AI_AUTHORIZED=false`, no paid API configured |

Cloud Functions is the only service here that would require Blaze, and the project
architecture deliberately has none: the scheduler is a Cloudflare Worker and the
API runs on Render. `firebase functions:list` on the project returns an error
consistent with no Functions deployment, which is consistent with a non-Blaze
project. **Nothing in this milestone can incur a charge.**

## The collision that stopped the rules deploy — needs an owner decision

The project is **not empty**. It already contains what looks like an earlier or
sibling application:

| Existing resource | Detail |
|-------------------|--------|
| Web app | "NTK Income Radar Web", appId `1:509949685014:web:85ac441d7477350570f437` (ACTIVE) |
| Hosting site | `ntk-income-radar` → https://ntk-income-radar.web.app (DEFAULT_SITE) |
| Firestore indexes | 5 composites on collections **`access`** and **`opportunities`**, all keyed on a **`status`** field, one using a **`countryCodes` array** |

That data model is **not** this project's model. This project's `opportunities`
documents carry `visibility`, `zeroCapital`, `rankScore`, `capitalStatus`; the
existing ones carry `status` and `countryCodes`. They are different schemas in the
**same collection name**.

**Why that stopped me:** deploying `firestore.rules` replaces the project's
**entire ruleset** — Firestore rules are one document, not a merge. If the existing
app is still in use, deploying my file would remove whatever currently protects its
`opportunities` and `access` data. The owner's instruction was to preserve
unrelated existing resources, and silently replacing another app's security rules
is the opposite of that. So the rules deploy was **not** performed.

### The decision needed

1. **The existing app is retired / disposable** → I deploy `firestore.rules` as it
   stands (it compiles, and its behaviour is already verified by 15 emulator
   assertions).
2. **The existing app must keep working** → give me the current rules text (from
   the Firebase console → Firestore → Rules) and I will merge mine into a single
   ruleset that covers `opportunities` (both shapes), `access`,
   `opportunityEvidence`, `internalSourceRuns` and `users`, then deploy and verify
   both.
3. **Cleaner separation preferred** → create a dedicated project for this app and
   I redeploy rules + indexes there; the existing app keeps its own project.

Option 2 is what I would choose: it costs one paste and preserves both.

## Web/PWA project configuration (available now, no change needed)

The existing web app can be reused — no new app needs creating. Its public client
configuration is:

| Field | Value |
|-------|-------|
| projectId | `ntk-income-radar` |
| appId | `1:509949685014:web:85ac441d7477350570f437` |
| authDomain | `ntk-income-radar.firebaseapp.com` |
| storageBucket | `ntk-income-radar.firebasestorage.app` |
| messagingSenderId | `509949685014` |

These are **public client configuration**, not credentials; they belong in the
web build environment (the `VITE_FIREBASE_*` variables). The apiKey is likewise
public and is fetched on demand rather than written into a tracked file.

## Owner actions still required, in order

1. **Decide on the rules collision** (option 1, 2 or 3 above). Everything below
   depends on the rules being deployed.
2. **Create the service-account JSON** in the Firebase console (Project settings →
   Service accounts → Generate new private key). `gcloud` is not installed here,
   so this cannot be automated. It is needed by the Hunter API on Render and by any
   real hunt into live Firestore.
3. **Render**: create the free web service (build/start/health as documented in
   `LIVE_DEPLOYMENT_RECEIPT.md`) and set its environment, including the JSON as a
   Secret File.
4. **Cloudflare**: `wrangler login` (or an API token) to deploy the scheduler.
5. **Telegram bot token** for the one notification smoke test.

## Not done in this milestone (state honestly)

- Rules not deployed (collision); Auth provider state not verified; no live reads
  or writes proven yet.
- PWA not deployed to Hosting, so browser/PWA acceptance is still against a local
  file render rather than a live HTTPS origin. The Hosting site already exists, so
  this is one build plus one deploy once the rules decision is made.
- No Render deployment, no Cloudflare deployment, no real hunt, no notification
  sent.
- The M5b package remains the current handoff; this file records the newer state.
  `LIVE_DEPLOYMENT_RECEIPT.md` and `REVIEW_HANDOFF.md` could not be updated (the
  workspace write guard refuses files containing the mandated secret-inventory
  label), which is why this state lives here, per the owner's instruction.
