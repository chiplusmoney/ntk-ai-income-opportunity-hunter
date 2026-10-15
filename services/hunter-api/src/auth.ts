import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { ApiConfig } from './config.js';
import type { Logger } from './logging.js';

/**
 * Shared-secret authentication for scheduler-triggered work.
 *
 * Design notes:
 *  - The header name matches what the existing Cloudflare worker already sends
 *    (`x-ntk-hunter-secret`), and `Authorization: Bearer …` is accepted too so
 *    the same endpoint works from a manual run or a future caller.
 *  - Comparison is constant-time over fixed-length SHA-256 digests, so a
 *    wrong-length guess cannot be distinguished by timing.
 *  - With no configured secret the check FAILS CLOSED. An unauthenticated hunt
 *    endpoint that writes to the database is the worst possible default.
 *  - The presented value is never logged, and never echoed in the response.
 */

export const SECRET_HEADER = 'x-ntk-hunter-secret';

export interface AuthOutcome {
  ok: boolean;
  /** Machine-readable reason, safe to log and to return. */
  code: 'authorised' | 'server-not-configured' | 'missing-credential' | 'invalid-credential';
  detail: string;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

export function extractPresentedSecret(request: Request): string | null {
  const header = request.get(SECRET_HEADER);
  if (typeof header === 'string' && header.trim().length > 0) return header.trim();

  const authorization = request.get('authorization');
  if (typeof authorization === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

export function verifySchedulerSecret(presented: string | null, expected: string): AuthOutcome {
  if (!expected || expected.length === 0) {
    return {
      ok: false,
      code: 'server-not-configured',
      detail: 'The service has no scheduler credential configured, so triggers are refused.'
    };
  }
  if (!presented || presented.length === 0) {
    return { ok: false, code: 'missing-credential', detail: 'No scheduler credential was presented.' };
  }

  const a = digest(presented);
  const b = digest(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, code: 'invalid-credential', detail: 'The presented scheduler credential is not valid.' };
  }

  return { ok: true, code: 'authorised', detail: 'Authorised as the scheduler.' };
}

/**
 * Express middleware. Attaches nothing to the request: the handler never needs
 * the secret, so it is not propagated further than this function.
 */
export function requireSchedulerSecret(config: ApiConfig, logger: Logger) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const outcome = verifySchedulerSecret(extractPresentedSecret(request), config.schedulerSecret);

    if (outcome.ok) {
      next();
      return;
    }

    logger.warn('Rejected an unauthenticated trigger', {
      code: outcome.code,
      path: request.path,
      method: request.method
    });

    const status = outcome.code === 'server-not-configured' ? 503 : 401;
    response.status(status).json({ error: outcome.code, message: outcome.detail });
  };
}
