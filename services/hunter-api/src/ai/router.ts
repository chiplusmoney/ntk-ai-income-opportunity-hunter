/**
 * /v1/ai routes — the only path from the PWA to AI assistance.
 *
 * The Firebase client never talks to the AlwaysData Core. It authenticates to Render with its
 * Firebase ID token; Render verifies it (with revocation), loads the authoritative records and calls
 * the Core with the server-side credential.
 */

import { Router, type Request, type Response } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { CAPABILITIES, type Capability } from './capabilities.js';
import type { AiService } from './service.js';

const ORIGINS = new Set([
  'https://ntk-income-opportunity-hunter.web.app',
  'https://ntk-income-opportunity-hunter.firebaseapp.com',
  'http://localhost:5173'
]);

/** AI is the expensive path: a tighter per-user limit than the private actions (30/min). */
const AI_REQUESTS_PER_MINUTE = 20;

export interface AiRouterOptions {
  ai: AiService;
  verify?: (token: string) => Promise<{ uid: string }>;
  now?: () => number;
}

function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

export function createAiRouter(options: AiRouterOptions) {
  const router = Router();
  const verify = options.verify ?? ((token: string) => getAuth().verifyIdToken(token, true));
  const now = options.now ?? (() => Date.now());
  const rates = new Map<string, { start: number; count: number }>();

  router.use(async (req: Request, res: Response, next) => {
    const origin = req.get('origin');
    if (origin && !ORIGINS.has(origin)) {
      res.status(403).json({ error: 'Origin not allowed' });
      return;
    }
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin);
      res.vary('Origin');
    }
    res.set('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.status(204).end();
      return;
    }

    const match = /^Bearer ([\S]+)$/.exec(req.get('authorization') ?? '');
    if (!match) {
      res.status(401).json({ error: 'Sign in to use AI assistance' });
      return;
    }
    try {
      const identity = await verify(match[1]!);
      const stamp = now();
      if (rates.size > 1000) {
        for (const [id, entry] of rates) if (stamp - entry.start > 60_000) rates.delete(id);
      }
      const entry = rates.get(identity.uid);
      if (entry && stamp - entry.start < 60_000 && entry.count >= AI_REQUESTS_PER_MINUTE) {
        res.status(429).json({ error: 'Please wait before asking the assistant again' });
        return;
      }
      rates.set(
        identity.uid,
        !entry || stamp - entry.start >= 60_000 ? { start: stamp, count: 1 } : { ...entry, count: entry.count + 1 }
      );
      res.locals.uid = identity.uid;
      next();
    } catch {
      res.status(401).json({ error: 'Your session expired. Sign in again' });
    }
  });

  /** Lightweight, safe status for the UI banner. No provider names, no credentials. */
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const status = await options.ai.status();
      res.json({
        state: status.state,
        configured: options.ai.configured,
        detail: status.detail,
        checkedAt: status.checkedAt
      });
    } catch {
      res.json({ state: 'temporarily-unavailable', configured: options.ai.configured, detail: 'status check failed', checkedAt: new Date(now()).toISOString() });
    }
  });

  router.post('/opportunities/:id/:capability', async (req: Request, res: Response) => {
    const uid = res.locals.uid as string;
    const capability = String(req.params.capability ?? '');
    const id = String(req.params.id ?? '');

    if (!isCapability(capability)) {
      res.status(404).json({ error: 'Unknown AI capability' });
      return;
    }
    if (capability === 'proof') {
      res.status(404).json({ error: 'Use /v1/ai/proof-summary for the proof summary' });
      return;
    }
    if (!/^[\w:.-]{1,200}$/.test(id)) {
      res.status(400).json({ error: 'Invalid opportunity id' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const purpose = typeof body.purpose === 'string' ? body.purpose.slice(0, 400) : undefined;
    const forceRefresh = body.forceRefresh === true;

    const outcome = await options.ai.run({ uid, capability, opportunityId: id, ...(purpose ? { purpose } : {}), forceRefresh });
    if (outcome.ok) {
      res.json({ capability, data: outcome.payload, meta: outcome.meta });
      return;
    }
    res.status(outcome.status).json({
      error: outcome.message,
      code: outcome.code,
      retryable: outcome.retryable,
      ...(outcome.problems ? { problems: outcome.problems } : {}),
      ...(outcome.meta ? { meta: outcome.meta } : {})
    });
  });

  router.post('/proof-summary', async (req: Request, res: Response) => {
    const uid = res.locals.uid as string;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const forceRefresh = body.forceRefresh === true;

    const outcome = await options.ai.run({ uid, capability: 'proof', forceRefresh });
    if (outcome.ok) {
      res.json({ capability: 'proof', data: outcome.payload, meta: outcome.meta });
      return;
    }
    res.status(outcome.status).json({
      error: outcome.message,
      code: outcome.code,
      retryable: outcome.retryable,
      ...(outcome.problems ? { problems: outcome.problems } : {}),
      ...(outcome.meta ? { meta: outcome.meta } : {})
    });
  });

  return router;
}
