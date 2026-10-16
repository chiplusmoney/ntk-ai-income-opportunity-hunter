# M7 security, quotas and performance

## Verified boundaries

All source URLs are registry-bound. No user input becomes a server fetch destination. HTTPS only, no URL credentials, at most two same-host redirects; external/private redirects are refused before a second request. The response reader caps bytes during streaming rather than buffering an unlimited body first. Structured HTML is converted to plain text; React escapes display content. Malformed RSS entities are bounded to valid Unicode code points.

Firebase ID tokens are verified with revocation checking. Source operations require the configured owner UID; anonymous is 401, another UID or missing owner configuration is 403. Requests are origin checked, rate bounded and no-store. Internal run schedules, dedupe identities, queue candidates, source health, yield and notification attempt records remain server-only under the existing deny rules; seven new emulator cases explicitly exercise those paths. Existing UID/private ledgers and payment protections remain intact. No rule/index was removed or weakened.

Notification opt-in is re-read inside the delivery reservation transaction. Attempt records, counters and selected deliveries are atomic; deletion of the user-facing notice never removes its attempt. Invalid timezone/policy fails closed. The connected Telegram destination is fixed in server configuration and restricted to the owner UID. Token and destination are never frontend fields, public metadata, source files or ZIP content. One ambiguous transport attempt is never retried automatically. Mock transport covers timeouts and owner mismatch. No new live Telegram message is sent.

Private Firestore uses UID-scoped RAM, never persistent public cache. Offline hard reloads show unavailable private data rather than false empty ledgers; reconnect recovers server state. The service worker only caches same-origin public assets and route HTML, preserving M6 revalidation behavior. Source Health uses a private authenticated API, so it is not cached by the service worker.

## Free-tier bounds

Firebase remains Spark; Render remains Free; canonical Worker/cron reused. No billing changes, subscriptions, paid APIs or AI. Maximum six source adapters considered per run; each has its own interval and row cap. New feeds use one page every six hours. At most 200 incoming publication candidates per pass, 50 queued resumptions, 200 dedupe-key reads and 400 direct opportunity reads; no full catalog scan. Same content skips repeat public/evidence writes within a day. A small persistent source-reservation read replaces repeated 200-row historical windows once bootstrapped.

Notifications evaluate at most two opted-in users per heartbeat, 100 recent catalog rows shared by the pass plus at most 50 saved rows per user, 51 application/21 proof reads to detect a 50/20 cap, 20 attempt checks per user and one delivery per user. Daily max three and cooldown minimum six hours. A persistent UID cursor prevents permanently favoring the first users. Some users may wait multiple heartbeats as membership grows. This is a deliberate free-tier operating bound, not a claim of unlimited throughput. Disabled users incur no per-user application/proof/catalog evaluation. Over-cap private histories skip and appear in the pass summary; do not silently treat truncated histories as complete.

The worst source-read budget only occurs when those sources are due, not every heartbeat. Source-specific intervals and unchanged-write suppression reduce repeated work. Public browsing/private listeners also consume Spark quota, so the service is appropriate for a small community and requires observed quota review before relaxing bounds. No artificial keep-alive traffic. Internal provenance/attempt/run records grow over time; a future explicit retention policy may be needed at sustained scale. No existing production data was deleted for this milestone.

## Performance receipt

`docs/verification/m7-performance.json` records synthetic local Node 24 measurements, three warm samples at 1,000/5,000/10,000 rows after warm-up. At 10,000 rows the worst warm measurements were: dedupe 102.93 ms, ranking 15.35 ms, Personal Fit 128.26 ms, health aggregation 8.71 ms and notification selection 16.63 ms. This is not a mobile CPU certification. The client still bounds the catalog to 50 displayed/cache records; heavy ingestion and dispatch remain server-side. Source Health is a separate lazy chunk (~7.67 kB uncompressed). Main bundle remains ~949.73 kB (~288.69 kB gzip), with a build warning above 500 kB; this is a known optimization opportunity, not hidden as a pass.

## Residual owner action

The unrelated historical Firebase CLI OAuth grant cleanup remains an owner-security housekeeping action. Do not switch Google accounts to perform it or reproduce any credential. See `OAUTH_SECURITY_ACTION.md`. It does not block the verified project account or production chain. Actual server credentials remain in the existing Render secret file/environment and encrypted Cloudflare secret binding.
