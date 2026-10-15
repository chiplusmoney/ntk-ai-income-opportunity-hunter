import { describe, expect, it } from 'vitest';
import { extractPresentedSecret, verifySchedulerSecret, SECRET_HEADER } from '../src/auth.js';
import { createLogger, redact, silentLogger } from '../src/logging.js';
import { describeConfigProblems, loadConfig, sensitiveValues } from '../src/config.js';
import type { Request } from 'express';

const SECRET = 'scheduler-secret-value-1234567890';

function fakeRequest(headers: Record<string, string>): Request {
  return {
    get: (name: string) => headers[name.toLowerCase()]
  } as unknown as Request;
}

describe('scheduler authentication', () => {
  it('authorises the correct secret', () => {
    const outcome = verifySchedulerSecret(SECRET, SECRET);
    expect(outcome.ok).toBe(true);
    expect(outcome.code).toBe('authorised');
  });

  it('refuses when the server has no secret configured, even with a presented value', () => {
    const outcome = verifySchedulerSecret(SECRET, '');
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe('server-not-configured');
  });

  it('refuses a missing credential', () => {
    expect(verifySchedulerSecret(null, SECRET).code).toBe('missing-credential');
    expect(verifySchedulerSecret('', SECRET).code).toBe('missing-credential');
  });

  it('refuses a wrong secret of the same length', () => {
    const wrong = 'x'.repeat(SECRET.length);
    expect(verifySchedulerSecret(wrong, SECRET).code).toBe('invalid-credential');
  });

  it('refuses a wrong secret of a different length without leaking the length in the result', () => {
    const outcome = verifySchedulerSecret('short', SECRET);
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe('invalid-credential');
  });

  it('refuses a prefix of the real secret', () => {
    expect(verifySchedulerSecret(SECRET.slice(0, 20), SECRET).ok).toBe(false);
  });

  it('never includes the secret in its detail message', () => {
    const outcome = verifySchedulerSecret('guess', SECRET);
    expect(outcome.detail).not.toContain(SECRET);
  });

  it('reads the worker header the deployed scheduler already sends', () => {
    const request = fakeRequest({ [SECRET_HEADER]: SECRET });
    expect(extractPresentedSecret(request)).toBe(SECRET);
  });

  it('accepts a bearer token as well', () => {
    expect(extractPresentedSecret(fakeRequest({ authorization: `Bearer ${SECRET}` }))).toBe(SECRET);
    expect(extractPresentedSecret(fakeRequest({ authorization: 'Basic abc' }))).toBeNull();
  });

  it('returns null when nothing is presented', () => {
    expect(extractPresentedSecret(fakeRequest({}))).toBeNull();
  });
});

describe('log redaction', () => {
  it('removes a known secret literal from a message', () => {
    expect(redact(`failed with ${SECRET}`, [SECRET])).toBe('failed with [redacted]');
  });

  it('removes a secret that appears several times', () => {
    expect(redact(`${SECRET} and ${SECRET}`, [SECRET])).toBe('[redacted] and [redacted]');
  });

  it('ignores short values so ordinary words are not mangled', () => {
    expect(redact('the api key is abc', ['abc'])).toBe('the api key is abc');
  });

  it('redacts by field name even when the value is unknown', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (line?: unknown) => lines.push(String(line));
    try {
      createLogger('debug', []).info('starting', {
        authorization: 'Bearer something',
        apiKey: 'live-key',
        safe: 'visible'
      });
    } finally {
      console.log = original;
    }
    const output = lines.join('\n');
    expect(output).not.toContain('Bearer something');
    expect(output).not.toContain('live-key');
    expect(output).toContain('visible');
  });

  it('redacts nested error messages', () => {
    const lines: string[] = [];
    const original = console.error;
    console.error = (line?: unknown) => lines.push(String(line));
    try {
      createLogger('debug', [SECRET]).error('boom', { error: new Error(`auth ${SECRET} rejected`) });
    } finally {
      console.error = original;
    }
    expect(lines.join('\n')).not.toContain(SECRET);
    expect(lines.join('\n')).toContain('[redacted]');
  });

  it('respects the level threshold', () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (line?: unknown) => lines.push(String(line));
    try {
      createLogger('error', []).info('should not appear');
    } finally {
      console.log = original;
    }
    expect(lines).toHaveLength(0);
  });

  it('exposes a silent logger for tests', () => {
    expect(() => silentLogger.info('nothing')).not.toThrow();
    expect(silentLogger.withSecrets(['x'])).toBe(silentLogger);
  });
});

describe('configuration', () => {
  it('fails closed when the scheduler secret is missing', () => {
    const config = loadConfig({});
    expect(config.schedulerSecret).toBe('');
    const problems = describeConfigProblems(config);
    expect(problems.map(p => p.field)).toContain('HUNTER_SHARED_SECRET');
    expect(problems.map(p => p.field)).toContain('FIREBASE_PROJECT_ID');
  });

  it('rejects a too-short secret', () => {
    const problems = describeConfigProblems(loadConfig({ HUNTER_SHARED_SECRET: 'short', FIREBASE_PROJECT_ID: 'p' }));
    expect(problems.some(p => p.problem.includes('too short'))).toBe(true);
  });

  it('detects emulator mode from the standard environment variable', () => {
    const config = loadConfig({ FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080', HUNTER_SHARED_SECRET: SECRET });
    expect(config.usingEmulator).toBe(true);
    expect(describeConfigProblems(config).map(p => p.field)).not.toContain('FIREBASE_PROJECT_ID');
  });

  it('never defaults paid AI to authorised', () => {
    expect(loadConfig({}).paidAiAuthorized).toBe(false);
    expect(loadConfig({ PAID_AI_AUTHORIZED: 'true' }).paidAiAuthorized).toBe(true);
  });

  it('parses numbers with a sane fallback', () => {
    expect(loadConfig({ PORT: '3000' }).port).toBe(3000);
    expect(loadConfig({ PORT: 'not-a-number' }).port).toBe(8080);
  });

  it('lists the values that must be redacted', () => {
    const config = loadConfig({ HUNTER_SHARED_SECRET: SECRET, FLAGSHIP_ROUTER_API_KEY: 'router-key-abcdef' });
    expect(sensitiveValues(config)).toContain(SECRET);
    expect(sensitiveValues(config)).toContain('router-key-abcdef');
  });

  it('does not redact an empty value into oblivion', () => {
    expect(sensitiveValues(loadConfig({}))).toEqual([]);
  });
});
