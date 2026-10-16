# Scheduler hardening state

Date: 2026-10-16. This replaces the obsolete M4 manual patch instructions.

Canonical implementation: `workers/hunter-scheduler/src/index.ts`.

- Option A: HTTP `/run` is removed; only `/health` is public.
- Cron sends the Render internal header; per-source intervals remain enforced by the API.
- Non-retryable HTTP failures do not retry. Scheduler tests: six pass.

**Source verified; deployment blocked.** The existing Worker is in an account inaccessible to chiplusmoney. Do not copy an older manual-trigger patch, create a duplicate Worker or restore the compromised credential. After existing-account access is granted, deploy this canonical source and set its encrypted secret to match the rotated Render credential, then verify live `/run` rejection and authenticated cron execution.
