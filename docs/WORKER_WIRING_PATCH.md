# Worker wiring patch (owner action)

## Why this file exists instead of an applied change

`workers/hunter-scheduler/src/index.ts` could not be edited during M4: every write
to it was refused by the workspace safety guard, which reads the env binding
`HUNTER_SHARED_SECRET: string` as a hardcoded credential. It is a false positive —
the declaration has no literal value — and the guard's own message says to let the
owner decide rather than work around it. The file is therefore **byte-identical**
to the M3 package.

## Nothing is broken without it

The deployed worker already does exactly what the new API serves:

| Worker sends | API serves |
|--------------|-----------|
| `POST ${HUNTER_API_URL}/internal/hunt` | `POST /internal/hunt` ✓ |
| header `x-ntk-hunter-secret: <secret>` | same header, constant-time compared ✓ |
| body `{ reason, mode, regionPriority, policy }` | unknown fields ignored, `reason` read ✓ |

So the current flow works as-is. The patch below is an improvement, not a fix.

## What the patch adds

1. Declares the interval policy to the API (documentation of intent, and useful
   when reading a run summary).
2. Forwards an optional `sources` list from the manual trigger.
3. Retries the trigger with a bounded backoff, which is safe because every write
   is idempotent (deterministic document ids): a re-run updates the same
   documents instead of duplicating them.
4. Treats `409 busy` as "another run holds the lock" rather than an error, so the
   scheduler does not retry into a run already in progress.

## The change

Replace everything from `async function trigger(` to the end of the file with:

```ts
const INTERVAL_POLICY = 'per-source-min-interval' as const;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 4000];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function triggerOnce(env: Env, reason: string, sourceIds: string[]): Promise<Response> {
  return fetch(`${env.HUNTER_API_URL}/internal/hunt`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ntk-hunter-secret': env.HUNTER_SHARED_SECRET
    },
    body: JSON.stringify({
      reason,
      mode: 'incremental',
      regionPriority: env.DEFAULT_REGION_PRIORITY.split(',').filter(Boolean),
      // The cron is a HEARTBEAT, not a per-source cadence: the Hunter API decides
      // what is actually due from each source's registry interval.
      intervalPolicy: INTERVAL_POLICY,
      sources: sourceIds,
      policy: {
        zeroCapitalFirst: true,
        directIncomeFirst: true,
        competitionsDefault: false,
        aiPolicy: 'free-first-capability-aware',
        requireEvidenceSnapshot: true
      }
    })
  });
}

async function trigger(env: Env, reason: string, sourceIds: string[] = []): Promise<string> {
  let lastError = 'unknown error';

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await triggerOnce(env, reason, sourceIds);

      // Another run holds the single-flight lock: not an error, and retrying
      // would only contend with work already in progress.
      if (response.status === 409) return response.text();

      if (response.ok) return response.text();

      lastError = `Hunter API returned ${response.status}`;
      // 4xx other than 409 will not improve on retry.
      if (response.status >= 400 && response.status < 500) throw new Error(lastError);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    const wait = BACKOFF_MS[attempt];
    if (wait !== undefined && attempt < MAX_ATTEMPTS - 1) await sleep(wait);
  }

  throw new Error(lastError);
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(trigger(env, 'cron-30m'));
  },
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return Response.json({
        ok: true,
        service: 'hunter-scheduler',
        intervalPolicy: INTERVAL_POLICY,
        note: 'The cron heartbeat is not a per-source crawl cadence; the Hunter API enforces registry intervals.'
      });
    }

    if (url.pathname === '/run' && request.method === 'POST') {
      const sourceIds = (url.searchParams.get('sources') ?? '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
      try {
        return new Response(await trigger(env, 'manual', sourceIds));
      } catch (error) {
        return new Response(error instanceof Error ? error.message : 'trigger failed', { status: 502 });
      }
    }

    return new Response('Not found', { status: 404 });
  }
};
```

Keep the `Env` interface exactly as it is.

## After applying

```bash
cd WORKING
npm --workspace workers/hunter-scheduler run typecheck
npm --workspace workers/hunter-scheduler run build
```

Then deploy the worker as usual. Nothing else in the repository needs to change:
the API path, the header name and the secret are unchanged.

## Why the retry is safe

`FirestoreOpportunityWriter` writes each opportunity to
`opportunities/{sourceId}:{sourceItemId}` with `set` (not `add`), and each source
run to `internalSourceRuns/{sourceId}_{startedAt}` where `startedAt` comes from
the run's injected clock. A retried trigger therefore either re-writes the same
documents with the same content, or starts a genuinely new run — it can never
append a duplicate opportunity. This is asserted by
`services/hunter-api/test/writer.test.ts` ("is idempotent") and by the emulator
suite ("updates the same documents on a repeat crawl instead of duplicating
them").
