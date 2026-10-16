# Canonical scheduler wiring - final M5b

Date: 2026-10-16. This supersedes earlier manual patch and inaccessible-account instructions.

Canonical Worker: ntk-income-opportunity-hunter-scheduler, account 4f67a960d66dff69c2fcab490616c811, https://ntk-income-opportunity-hunter-scheduler.chiplusmoney.workers.dev. This is the sole authoritative scheduler. Workers Free; no paid add-on. Its deployed module was independently compared byte for byte with the tested compiled source.

The only harmless public endpoint is /health. POST /run returns 404 and invokes no downstream work. Cron scheduled events call Render POST /internal/hunt using the encrypted HUNTER_SHARED_SECRET binding. Configuration is */30 * * * *; source intervals are enforced by the API. No Render keep-alive task exists.

Structured logs select timestamps, run ID, outcome and counts only; they never copy source payloads, environment, request headers or raw responses. Nine scheduler tests pass. A due scheduled run and its zero-write repeat were verified across Cloudflare, Render and Firestore.

The old ntk-note subdomain Worker is orphaned, credential-invalidated and noncanonical. Do not rely on it, seek access indefinitely, mutate its inaccessible account or restore its prior credential. The owner's replacement authorization is the basis for this new resource.

Final regular-cron confirmation: actual provider event `*/30 * * * *` completed at 2026-10-16T02:30:27.919Z (03:30 Lagos). Cloudflare and Render match `run_2026-10-16T02:30:27.644Z`, zero writes, zero failures. The last observed short-interval propagation event was 02:21 UTC; the regular production cadence is now proven. See verification/regular-cron.json.
