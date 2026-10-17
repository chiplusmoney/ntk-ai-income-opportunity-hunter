/**
 * NTK Hunter AI Core client — the single server-side boundary between Hunter and the
 * AlwaysData Core.
 *
 * Rules encoded here (docs/M8_ACCEPTANCE.md, M8 integration brief):
 *  - The application asks for a capability, never a provider or model.
 *  - The credential is server-side only and is never logged, echoed or put in a response.
 *  - A Core 503 (`AI_SERVICE_TEMPORARILY_UNAVAILABLE`) means every free provider is cooling down:
 *    that is NOT retried here, because the Core already walked its whole chain.
 *  - Timeouts and transport errors get at most one extra attempt, so Render can never create a
 *    retry storm against a free tier.
 *  - Nothing about provider identity is trusted from the client; provenance is whatever the Core
 *    reports and is stored as metadata only.
 */

export interface CoreConfig {
  /** Base URL including the version segment, e.g. https://ntkhaic.alwaysdata.net/v1 */
  baseUrl: string;
  /** Production API key. Server-side only. */
  apiKey: string;
  /** Per-request timeout for the whole call, including connection. */
  timeoutMs: number;
  /** Total attempts for transport/5xx failures. 503 is never retried. */
  maxAttempts: number;
}

export type CoreFailureReason = 'not-configured' | 'unavailable' | 'timeout' | 'invalid-response' | 'error';

export interface CoreSuccess {
  ok: true;
  content: string;
  model: string | null;
  provider: string | null;
  latencyMs: number;
  attempts: number;
}

export interface CoreFailure {
  ok: false;
  reason: CoreFailureReason;
  status: number | null;
  /** Stable upstream code when the Core reported one (e.g. AI_SERVICE_TEMPORARILY_UNAVAILABLE). */
  code: string | null;
  latencyMs: number;
  attempts: number;
  /** Redacted, length-capped diagnostic. Never contains the credential. */
  detail: string;
}

export type CoreResult = CoreSuccess | CoreFailure;

export interface CoreMessage {
  role: 'system' | 'user';
  content: string;
}

export interface CoreCallOptions {
  messages: CoreMessage[];
  maxTokens: number;
  temperature?: number;
  /** Label used only for diagnostics in logs (never sent upstream). */
  label: string;
}

type FetchLike = typeof fetch;

const CORE_UNAVAILABLE = 'AI_SERVICE_TEMPORARILY_UNAVAILABLE';

/** Trim and normalise the configured base URL; tolerates a trailing slash. */
export function normaliseBaseUrl(raw: string): string {
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  // Accept either https://host or https://host/v1
  return /\/v\d+$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 6) out = out.split(secret).join('[redacted]');
  }
  return out.replace(/\s+/g, ' ').slice(0, 300);
}

function providerFromBody(body: unknown): { model: string | null; provider: string | null } {
  if (!body || typeof body !== 'object') return { model: null, provider: null };
  const record = body as Record<string, unknown>;
  const model = typeof record.model === 'string' ? record.model : null;
  const provider =
    typeof record.provider === 'string'
      ? record.provider
      : typeof (record as { x_provider?: unknown }).x_provider === 'string'
        ? ((record as { x_provider?: string }).x_provider ?? null)
        : null;
  return { model, provider };
}

function contentFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as { message?: { content?: unknown; reasoning_content?: unknown; reasoning?: unknown } };
  const content = first?.message?.content;
  if (typeof content === 'string' && content.trim()) return content;
  const reasoning = first?.message?.reasoning_content ?? first?.message?.reasoning;
  if (typeof reasoning === 'string' && reasoning.trim()) return reasoning;
  // Some providers return an array of parts; keep the text parts only.
  if (Array.isArray(content)) {
    const parts = content
      .map((p) => (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : ''))
      .join('');
    return parts || null;
  }
  return null;
}

export class CoreClient {
  private readonly baseUrl: string;

  constructor(
    private readonly config: CoreConfig,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = () => Date.now()
  ) {
    this.baseUrl = normaliseBaseUrl(config.baseUrl);
  }

  get configured(): boolean {
    return Boolean(this.baseUrl && this.config.apiKey);
  }

  /** Safe description for /ready and the Hunter-side status view. */
  describe(): { configured: boolean; baseUrl: string } {
    return { configured: this.configured, baseUrl: this.baseUrl };
  }

  private secrets(): string[] {
    return [this.config.apiKey].filter(Boolean);
  }

  async completeJson(options: CoreCallOptions): Promise<CoreResult> {
    if (!this.configured) {
      return {
        ok: false,
        reason: 'not-configured',
        status: null,
        code: null,
        latencyMs: 0,
        attempts: 0,
        detail: 'Core is not configured'
      };
    }

    const started = this.now();
    let attempts = 0;
    let lastDetail = '';

    while (attempts < Math.max(1, this.config.maxAttempts)) {
      attempts += 1;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1000, this.config.timeoutMs));

      try {
        const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.config.apiKey}`
          },
          body: JSON.stringify({
            model: 'ntk-hunter-remote-free',
            messages: options.messages,
            max_tokens: options.maxTokens,
            temperature: options.temperature ?? 0.2,
            stream: false
          }),
          signal: controller.signal
        });

        const latencyMs = this.now() - started;
        const text = await response.text().catch(() => '');
        let body: unknown = null;
        try {
          const cleaned = text.replace(/data:\s*\[DONE\]\s*$/i, '').trim();
          body = cleaned ? JSON.parse(cleaned) : null;
        } catch {
          const firstBrace = text.indexOf('{');
          const lastBrace = text.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            try {
              body = JSON.parse(text.slice(firstBrace, lastBrace + 1));
            } catch {
              body = null;
            }
          }
        }

        if (response.ok) {
          const content = contentFromBody(body);
          if (!content) {
            return {
              ok: false,
              reason: 'invalid-response',
              status: response.status,
              code: null,
              latencyMs,
              attempts,
              detail: 'Core returned no message content'
            };
          }
          const { model, provider } = providerFromBody(body);
          return { ok: true, content, model, provider, latencyMs, attempts };
        }

        const code =
          body && typeof body === 'object'
            ? ((body as { error?: { code?: unknown } }).error?.code as string | undefined) ??
              ((body as { code?: unknown }).code as string | undefined) ??
              null
            : null;
        const message =
          body && typeof body === 'object'
            ? ((body as { error?: { message?: unknown } }).error?.message as string | undefined) ?? ''
            : '';
        lastDetail = redact(`${response.status} ${code ?? ''} ${message}`, this.secrets());

        // All free providers cooling down: retrying here would only burn quota.
        if (response.status === 503 || code === CORE_UNAVAILABLE) {
          return {
            ok: false,
            reason: 'unavailable',
            status: response.status,
            code: code ?? CORE_UNAVAILABLE,
            latencyMs,
            attempts,
            detail: lastDetail
          };
        }

        // 4xx (bad key, bad request) is not transient.
        if (response.status >= 400 && response.status < 500) {
          return {
            ok: false,
            reason: 'error',
            status: response.status,
            code,
            latencyMs,
            attempts,
            detail: lastDetail
          };
        }
        // 5xx falls through to the retry decision below.
      } catch (error) {
        const latencyMs = this.now() - started;
        const aborted = error instanceof Error && (error.name === 'AbortError' || /abort/i.test(error.message));
        lastDetail = redact(aborted ? 'timeout' : (error as Error)?.message ?? 'transport error', this.secrets());
        if (attempts >= Math.max(1, this.config.maxAttempts)) {
          return {
            ok: false,
            reason: aborted ? 'timeout' : 'error',
            status: null,
            code: null,
            latencyMs,
            attempts,
            detail: lastDetail
          };
        }
      } finally {
        clearTimeout(timer);
      }
    }

    return {
      ok: false,
      reason: 'error',
      status: null,
      code: null,
      latencyMs: this.now() - started,
      attempts,
      detail: lastDetail || 'exhausted attempts'
    };
  }

  /** Cheap availability probe used by the Hunter status view (public /api/health on the Core). */
  async probe(): Promise<{ available: boolean; latencyMs: number; detail: string }> {
    if (!this.configured) return { available: false, latencyMs: 0, detail: 'not configured' };
    const started = this.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(5000, Math.max(1000, this.config.timeoutMs)));
    const root = this.baseUrl.replace(/\/v\d+$/, '');
    try {
      const response = await this.fetchImpl(`${root}/api/health`, { signal: controller.signal });
      const latencyMs = this.now() - started;
      return {
        available: response.ok,
        latencyMs,
        detail: response.ok ? 'reachable' : `status ${response.status}`
      };
    } catch (error) {
      const aborted = error instanceof Error && /abort/i.test(error.message);
      return { available: false, latencyMs: this.now() - started, detail: aborted ? 'timeout' : 'unreachable' };
    } finally {
      clearTimeout(timer);
    }
  }
}
