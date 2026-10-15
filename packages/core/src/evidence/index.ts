import type { EvidenceAssertion, EvidenceSnapshot } from '../types.js';

/**
 * Evidence helpers.
 *
 * Every published claim must be traceable to a snapshot whose bytes we hashed.
 * Nothing here may synthesise a value: a missing fact yields an `absent`
 * assertion with `value: null`, which downstream stages treat as unknown.
 */

/** Strip HTML tags and collapse whitespace; used for bounded excerpts only. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Bounded excerpt helper — keeps excerpts small and deterministic. */
export function excerpt(text: string, max = 400): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/**
 * SHA-256 hex digest.
 *
 * Runs on WebCrypto when available (browser, Cloudflare Workers, Node 18+) and
 * falls back to Node's crypto module. The digest is over the exact fetched
 * bytes, so a recheck can prove the upstream payload did or did not change.
 *
 * The Node specifier is built at runtime on purpose: a literal
 * `import('node:crypto')` would force every consumer of this package —
 * including the browser-typed web app — to pull in Node's type definitions.
 * The browser and Worker runtimes take the WebCrypto branch above, so this
 * fallback only ever executes in Node, where the module exists.
 */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);

  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (webCrypto?.subtle) {
    const digest = await webCrypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const nodeSpecifier = 'node:crypto';
  const nodeCrypto = (await import(/* @vite-ignore */ nodeSpecifier)) as {
    createHash: (algorithm: string) => { update(data: Uint8Array): { digest(encoding: string): string } };
  };
  return nodeCrypto.createHash('sha256').update(bytes).digest('hex');
}

export async function createSnapshot(params: {
  sourceId: string;
  sourceUrl: string;
  fetchedAt: string;
  payload: string;
  httpStatus: number;
  excerptSource?: string;
}): Promise<EvidenceSnapshot> {
  const { sourceId, sourceUrl, fetchedAt, payload, httpStatus, excerptSource } = params;
  return {
    sourceId,
    sourceUrl,
    fetchedAt,
    contentHash: await sha256Hex(payload),
    bytes: new TextEncoder().encode(payload).length,
    httpStatus,
    excerpt: excerpt(excerptSource ?? payload)
  };
}

/** Build a positive assertion tied to a snapshot. */
export function assertion(
  field: string,
  value: string | number | boolean,
  snapshotIndex: number,
  method: EvidenceAssertion['method'],
  confidence: number,
  text?: string
): EvidenceAssertion {
  return { field, value, method, snapshotIndex, confidence, ...(text ? { text: excerpt(text, 200) } : {}) };
}

/** Build an `absent` assertion. Downstream treats this as unknown, never false. */
export function absentAssertion(field: string, confidence = 0): EvidenceAssertion {
  return { field, value: null, method: 'absent', snapshotIndex: null, confidence };
}

export function mergeEvidence(
  ...groups: { snapshots: EvidenceSnapshot[]; assertions: EvidenceAssertion[] }[]
): { snapshots: EvidenceSnapshot[]; assertions: EvidenceAssertion[] } {
  const snapshots: EvidenceSnapshot[] = [];
  const assertions: EvidenceAssertion[] = [];

  for (const group of groups) {
    const offset = snapshots.length;
    snapshots.push(...group.snapshots);
    for (const a of group.assertions) {
      assertions.push({
        ...a,
        snapshotIndex: a.snapshotIndex === null ? null : a.snapshotIndex + offset
      });
    }
  }

  return { snapshots, assertions };
}

/** Stable digest over evidence content, used as the published record's proof. */
export async function evidenceHash(snapshot: EvidenceSnapshot): Promise<string> {
  return sha256Hex(`${snapshot.sourceId}|${snapshot.sourceUrl}|${snapshot.contentHash}|${snapshot.fetchedAt}`);
}

/** Count how many asserted fields never got a value. Drives the confidence metric. */
export function unknownFieldCount(assertions: EvidenceAssertion[]): number {
  return assertions.filter(a => a.method === 'absent').length;
}

/** True when the field was positively established from a real snapshot. */
export function isEstablished(assertions: EvidenceAssertion[], field: string): boolean {
  return assertions.some(a => a.field === field && a.method !== 'absent' && a.value !== null);
}
