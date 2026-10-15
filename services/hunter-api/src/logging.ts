/**
 * Structured logging with mandatory redaction.
 *
 * The scheduler secret and any provider credential must never reach a log sink:
 * logs are the easiest place for a server-side secret to leak into a shared
 * system. Every line goes through `redact` first.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  /** A logger that redacts the given literals in addition to the defaults. */
  withSecrets(secrets: string[]): Logger;
}

const SECRET_KEY_PATTERN = /(secret|token|password|passphrase|authorization|api[-_]?key|credential|cookie)/i;
const REDACTED = '[redacted]';

/** Remove any occurrence of the known secret literals from a string. */
export function redact(input: string, secrets: string[] = []): string {
  let output = input;
  for (const secret of secrets) {
    if (secret.length < 6) continue;
    output = output.split(secret).join(REDACTED);
  }
  return output;
}

function sanitise(value: unknown, secrets: string[], depth = 0): unknown {
  if (depth > 6) return '[depth-limit]';
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') return redact(value, secrets);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message, secrets) };
  }
  if (Array.isArray(value)) return value.slice(0, 50).map(item => sanitise(item, secrets, depth + 1));

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : sanitise(nested, secrets, depth + 1);
    }
    return out;
  }

  return redact(String(value), secrets);
}

export function createLogger(level: LogLevel = 'info', secrets: string[] = []): Logger {
  const threshold = LEVELS[level];

  const emit = (entryLevel: LogLevel, message: string, fields?: Record<string, unknown>): void => {
    if (LEVELS[entryLevel] < threshold) return;
    const line = JSON.stringify({
      level: entryLevel,
      time: new Date().toISOString(),
      message: redact(message, secrets),
      ...(fields ? { fields: sanitise(fields, secrets) } : {})
    });
    // eslint-disable-next-line no-console -- stdout is the log sink on Render
    if (entryLevel === 'error' || entryLevel === 'warn') console.error(line);
    else console.log(line);
  };

  return {
    debug: (message, fields) => emit('debug', message, fields),
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
    withSecrets: (extra: string[]) => createLogger(level, [...secrets, ...extra])
  };
}

/** A logger that swallows everything; used by tests. */
export const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  withSecrets: () => silentLogger
};
