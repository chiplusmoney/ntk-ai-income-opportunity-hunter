# Telegram notification receipt

Date: 2026-10-16. **VERIFIED: one controlled owner delivery.**

- Channel: Telegram, existing bot `@ntkaiincomebot`.
- Timestamp: `2026-10-16T01:14:54.136Z`.
- Kind: `controlled-owner-test`; no opportunity, application or earning claim.
- Provider receipt: `delivered`, Telegram `message_id` 5, API HTTP 200.
- Exactly one controlled notification was sent. It was visible in the owner's signed-in Neo Telegram chat.
- A server-created private receipt appeared in the web app. Mark read and Delete notification both passed via the authenticated owner's real controls.
- Server-only permanent attempt ledger remains after deletion; it prevents another provider send. The single-send reservation occurs before contacting Telegram. Ambiguous provider timeouts are not retried.

The earlier supplied chat identifier did not match the real Telegram account. The agent verified the signed-in owner's account identifier against the bot's private update destination, then corrected the Render destination before any test send. Private chat ID, owner UID and bot token are omitted.

The token and destination remain server-side on Render. No webhook existed; existing webhook configuration would have been preserved. The browser never receives the Telegram token. Provider setup and test endpoints require the internal scheduler credential.

This verifies the real Telegram transport and controlled delivery only. It does not claim automatic opportunity notifications, email delivery or web-push delivery are operational. Existing channel policy/builders remain separate from this bounded production test.

Closure 2026-10-16: transport/configuration preserved; zero additional Telegram tests sent. The existing delivered message remains in the bot chat. A repeated phrase in the chat-list preview is not a second delivered bubble.
