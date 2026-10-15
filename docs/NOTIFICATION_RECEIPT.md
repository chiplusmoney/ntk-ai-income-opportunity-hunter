> SUPERSEDED PRE-REVIEW RECEIPT. Some claims below were not supported by live acceptance. Use `M5B_HARDENING_STATE.md` and the current verification receipts. This historical text is not a current completion claim.

# Notification Receipt — M5

Date: 2026-10-15

## Verdict

**BUILT AND TESTED — NOT DELIVERED.** The policy, the message composer and the
provider request builders are implemented and covered by tests. **Zero
notifications have been sent**, because no FCM, Telegram or email credentials
exist in this environment. No delivery is claimed.

## What was built

`packages/core/src/notifications/`

### Policy (`policy.ts`)

Two rules drive everything: urgency decides cadence, and a notification is not an
evidence document.

| Condition | Decision |
|-----------|----------|
| rank ≥ 80 **and** trust ≥ 60 | immediate — high-value-opportunity |
| deadline within 48 h | immediate — urgent-deadline |
| direct pay stated **and** rank ≥ 70 **and** trust ≥ 60 | immediate — strong-direct-pay |
| anything else useful | digest |
| expired deadline | **nothing** (checked before the score rules, so a high score cannot push a closed listing) |
| critical risk level | **nothing** |
| capital status `capital_required` | **nothing** — never pushed as an opportunity |
| trust < 25 | **nothing** — effectively blocked by the risk engine |
| every channel switched off | **nothing** |

Application status changes notify on `accepted`, `rejected`, `paid`, `expired`
only, and only when the state actually changed.

### Message composition and channels (`channels.ts`)

- Titles bounded to 120 characters, bodies to 400; the body carries provider,
  category, rank, trust, the **cost wording from the shared label table**, the
  deadline (or "No deadline published"), and the attribution.
- Deep links go back into the app; the machine-readable payload carries
  `opportunityId`, `kind`, `urgency`, `rankScore`, `capitalStatus`, `attribution`.
- Provider-neutral request builders: Telegram `sendMessage` (bot id supplied by
  the transport, never embedded in the body), an HTTP email provider (no SMTP
  ports, per the brief), and an FCM-style web-push payload.
- `findForbiddenContent()` scans every composed message for bearer tokens,
  private-key blocks, wallet-secret terminology, API-key shapes, service-account
  fields and raw JSON payloads. Tests assert clean messages stay clean **and**
  that the scanner actually catches a planted token.

### What is deliberately not in a message

No source payload, no evidence excerpt beyond the title, no reward figure that the
record does not state, no secret, no internal document id beyond the opportunity
id the user can open.

## What is not done

| Item | Status | Why |
|------|--------|-----|
| Push delivery | not sent | no FCM credentials or service worker push subscription flow on a deployed origin |
| Telegram delivery | not sent | no bot token |
| Email delivery | not sent | no HTTP provider endpoint or sender identity |
| Notification state persistence | policy ready, storage not exercised live | `users/{uid}/notifications` is server-write-only and covered by the rules tests; no server-side dispatch worker exists yet |
| Users toggling channels | model ready | preferences live in the profile contract and are validated; the UI toggle is not wired to a dispatcher |
| Dispatch worker / cron | not implemented | belongs with the Hunter API deployment, which is not deployed (see `LIVE_DEPLOYMENT_RECEIPT.md`) |

## SECRET REQUIRED

```
SECRET REQUIRED:
Telegram bot token and bot id (Telegram channel)

WHERE IT SHOULD BE CONFIGURED:
Render → hunter-api service → environment variables, server-side only.

STATUS:
NOT CONFIGURED
```

```
SECRET REQUIRED:
Web-push credentials for Firebase Cloud Messaging (push channel)

WHERE IT SHOULD BE CONFIGURED:
Server-side: the Firebase service-account JSON already required for Firestore.
Client-side: the public VAPID key in the web app build configuration.

STATUS:
NOT CONFIGURED
```

```
SECRET REQUIRED:
HTTP email provider endpoint and sender address (email channel)

WHERE IT SHOULD BE CONFIGURED:
Render → hunter-api service → environment variables. Never SMTP ports.

STATUS:
NOT CONFIGURED
```

## Route to delivery

1. Deploy the Hunter API (see the deployment receipt).
2. Add a dispatch step to the run that calls `decideNotification`, then
   `buildNotificationMessages`, then the matching transport.
3. Persist one document per sent notification under
   `users/{uid}/notifications` (server write only — already enforced by the
   rules tests).
4. Smoke test with the owner's own Telegram chat and email address first, then a
   single push subscription.

Until step 4 has actually happened, this channel set is **unverified in
delivery**, and the automated tests here only show what *would* be sent.
