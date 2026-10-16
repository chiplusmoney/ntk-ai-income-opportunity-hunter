/**
 * Minimal, dependency-free HTTP helper for source adapters.
 *
 * Design notes:
 *  - The same code runs in the browser, in a Cloudflare Worker and in Node, so
 *    it only uses `fetch` and `AbortController` from the global scope.
 *  - A non-2xx response is NOT an exception: the status and a bounded body
 *    snippet are returned so the run record can show what actually happened.
 *  - Responses are size-capped. A source that suddenly returns 50 MB must not
 *    blow up the worker.
 */

export const DEFAULT_USER_AGENT =
  'NTK-AI-Income-Hunter/0.3 (opportunity aggregator; read-only; contact: project owner)';

export const DEFAULT_TIMEOUT_MS = 20_000;
export const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export interface HttpContext {
  fetchImpl: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
  maxBytes?: number;
  /** Extra request headers. Never put a provider secret in a client bundle. */
  headers?: Record<string, string>;
}

export interface HttpResult {
  ok: boolean;
  status: number;
  contentType: string | null;
  bodyText: string;
  bytes: number;
  /** Populated when the request never produced a response. */
  error: string | null;
  durationMs: number;
  truncated: boolean;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message) return `${error.message} (${cause.message})`;
    return error.message;
  }
  return String(error);
}

export async function getText(url: string, ctx: HttpContext): Promise<HttpResult> {
  const startedAt = Date.now();
  const timeoutMs = ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = ctx.maxBytes ?? DEFAULT_MAX_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const origin = new URL(url);
    if (origin.protocol !== 'https:' || origin.username || origin.password) throw new Error('Source URL must be public HTTPS without credentials');
    let target = url;
    let response: Response;
    for (let redirect = 0; ; redirect++) {
    response = await ctx.fetchImpl(target, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        accept: 'application/json, application/xml, text/xml, text/html;q=0.8, */*;q=0.5',
        'user-agent': ctx.userAgent ?? DEFAULT_USER_AGENT,
        ...(ctx.headers ?? {})
      }
    });

    if (![301,302,303,307,308].includes(response.status)) break;
    const next = new URL(response.headers.get('location') ?? '', target);
    await response.body?.cancel();
    if (redirect >= 2 || next.protocol !== 'https:' || next.hostname !== origin.hostname || next.username || next.password) throw new Error('Source redirect outside the registered HTTPS host refused');
    target = next.href;
    }
    const contentType = response.headers.get('content-type');
    const chunks: Uint8Array[] = [];let received=0;let truncated=false;
    if (Number(response.headers.get('content-length') ?? 0)>maxBytes) { await response.body?.cancel();truncated=true; }
    else if(response.body){const reader=response.body.getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;received+=value.byteLength;if(received>maxBytes){truncated=true;await reader.cancel();break;}chunks.push(value);}}finally{reader.releaseLock();}}
    const all=new Uint8Array(chunks.reduce((n,c)=>n+c.byteLength,0));let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.byteLength;}
    const bodyText = new TextDecoder().decode(all);

    return {
      ok: response.ok && !truncated,
      status: response.status,
      contentType,
      bodyText,
      // Byte length of what we received, not the character count.
      bytes: new TextEncoder().encode(bodyText).length,
      error: truncated ? 'Source response exceeded byte limit' : response.ok ? null : `HTTP ${response.status} ${response.statusText}`.trim(),
      durationMs: Date.now() - startedAt,
      truncated
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: null,
      bodyText: '',
      bytes: 0,
      error: describeError(error),
      durationMs: Date.now() - startedAt,
      truncated: false
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Parse JSON without throwing; returns null and a reason on malformed input. */
export function parseJson<T>(bodyText: string): { data: T | null; error: string | null } {
  if (!bodyText.trim()) return { data: null, error: 'Empty response body' };
  try {
    return { data: JSON.parse(bodyText) as T, error: null };
  } catch (error) {
    return { data: null, error: `Malformed JSON: ${describeError(error)}` };
  }
}
