export interface Env {
  HUNTER_API_URL: string;
  HUNTER_SHARED_SECRET: string;
  DEFAULT_REGION_PRIORITY: string;
}

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
      if (response.status === 409) return response.text();
      if (response.ok) return response.text();

      lastError = `Hunter API returned ${response.status}`;
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
    if (url.pathname === '/health') return Response.json({ ok: true, service: 'hunter-scheduler' });
    // Production has no HTTP trigger. Administrative execution uses the
    // provider's authenticated cron tooling; the scheduler credential never
    // becomes a browser/manual credential.
    return new Response('Not found', { status: 404 });
  }
};

