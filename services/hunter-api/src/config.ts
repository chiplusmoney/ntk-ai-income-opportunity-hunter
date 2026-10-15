/**
 * Runtime configuration.
 *
 * Rules that matter here:
 *  - Secrets are read from the environment only, never written to a log, never
 *    echoed in an error, never included in a response body.
 *  - Missing configuration FAILS CLOSED: without the scheduler shared secret the
 *    service answers 503 to every trigger rather than running unauthenticated.
 *  - No default secret is ever provided. An empty secret is not "no auth".
 */

export interface ApiConfig {
  port: number;
  /** Shared secret the Cloudflare scheduler must present. */
  schedulerSecret: string;
  /** Firebase project id. Empty means the emulator/project is resolved from the environment. */
  projectId: string;
  /** True when running against the Firestore emulator. */
  usingEmulator: boolean;
  /** Bearer token for the optional FlagshipRouter capability API. */
  flagshipRouterUrl: string;
  routerApiKey: string;
  /** Paid AI use is off unless explicitly authorised. */
  paidAiAuthorized: boolean;
  /** Hard cap on how long one run may take. */
  runTimeoutMs: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

function readString(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readBoolean(value: string | undefined): boolean {
  const normalized = readString(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function readInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(readString(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const emulatorHost = readString(env.FIRESTORE_EMULATOR_HOST);

  return {
    port: readInteger(env.PORT, 8080),
    schedulerSecret: readString(env.HUNTER_SHARED_SECRET),
    projectId: readString(env.FIREBASE_PROJECT_ID) || readString(env.GCLOUD_PROJECT),
    usingEmulator: emulatorHost.length > 0,
    flagshipRouterUrl: readString(env.FLAGSHIP_ROUTER_URL),
    routerApiKey: readString(env.FLAGSHIP_ROUTER_API_KEY),
    paidAiAuthorized: readBoolean(env.PAID_AI_AUTHORIZED),
    runTimeoutMs: readInteger(env.RUN_TIMEOUT_MS, 120_000),
    logLevel: (readString(env.LOG_LEVEL) || 'info') as ApiConfig['logLevel']
  };
}

export interface ConfigProblem {
  field: string;
  problem: string;
}

/**
 * Configuration problems that make a route unsafe or impossible.
 * The API reports these without revealing any values.
 */
export function describeConfigProblems(config: ApiConfig): ConfigProblem[] {
  const problems: ConfigProblem[] = [];

  if (!config.schedulerSecret) {
    problems.push({ field: 'HUNTER_SHARED_SECRET', problem: 'not set: authenticated triggers are disabled' });
  } else if (config.schedulerSecret.length < 16) {
    problems.push({ field: 'HUNTER_SHARED_SECRET', problem: 'too short: use at least 16 characters' });
  }

  if (!config.projectId && !config.usingEmulator) {
    problems.push({
      field: 'FIREBASE_PROJECT_ID',
      problem: 'not set and no emulator host configured: Firestore writes are disabled'
    });
  }

  return problems;
}

/**
 * Values that must never appear in a log line, an error message or a response.
 * Used by the logger and by the error handler to redact before emitting.
 */
export function sensitiveValues(config: ApiConfig): string[] {
  return [config.schedulerSecret, config.routerApiKey].filter(value => value.length >= 6);
}
