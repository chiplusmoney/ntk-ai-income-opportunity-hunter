import type { DedupeResult, OpportunityCandidate } from '../types.js';

/**
 * Deduplication.
 *
 * Two passes:
 *  1. Exact fingerprint (normalized provider + title) — re-crawls of the same
 *     posting collapse to one record.
 *  2. Token-set similarity for cross-source reposts of the same job.
 *
 * Similarity is Jaccard over normalized tokens with a small boost for a shared
 * provider, which is deterministic and cheap to reproduce.
 */

const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'for', 'with', 'to', 'of', 'in', 'on', 'at', 'by', 'or', 'as',
  'is', 'are', 'be', 'we', 'you', 'your', 'our', 'us', 'this', 'that', 'it', 'from', 'will',
  'remote', 'job', 'role', 'position', 'opportunity', 'work', 'hiring', 'needed', 'wanted'
]);

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&[a-z]+;/g, ' ')
    .replace(/[^a-z0-9\s+#.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .map(t => t.replace(/^[.+#]+|[.+#]+$/g, ''))
    .filter(t => t.length > 1 && !STOPWORDS.has(t));
}

/** Provider identity, collapsed so "Coalition Technologies " == "coalition technologies". */
export function normalizeProvider(provider: string): string {
  return (
    normalizeText(provider)
      .replace(/\b(inc|llc|ltd|limited|gmbh|corp|corporation|co|plc|sa|bv|oy|pty)\b/g, ' ')
      // Drop residual punctuation so "Acme Ltd." and "ACME" collapse to one key.
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Exact fingerprint: same normalized provider + same normalized title. */
export function fingerprintOf(provider: string, title: string): string {
  return `${normalizeProvider(provider)}::${normalizeText(title)}`;
}

/** Looser key used to bucket near-matches cheaply before scoring. */
export function normalizedKeyOf(title: string): string {
  return tokenize(title).sort().slice(0, 8).join('-');
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Tracking parameters are irrelevant; job IDs, requisition IDs and paths are not. */
export function canonicalListingUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (!['https:','http:'].includes(u.protocol) || u.username || u.password) return null;
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) if (/^utm_|^(ref|source|fbclid|gclid)$/i.test(key)) u.searchParams.delete(key);
    u.searchParams.sort();
    u.pathname = u.pathname.replace(/\/$/,'') || '/';
    return u.toString();
  } catch { return null; }
}

export interface ListingIdentity { sourceId:string; sourceItemId:string; sourceUrl:string; title:string; provider:string; description:string; countries:string[]; publishedAt:string|null }
/** False merging is worse than a duplicate. Same title alone never proves a repost. */
export function sameListing(a: ListingIdentity,b: ListingIdentity): boolean {
  if (a.sourceId === b.sourceId) return a.sourceItemId === b.sourceItemId;
  if (!normalizeProvider(a.provider) || normalizeProvider(a.provider) !== normalizeProvider(b.provider)) return false;
  if (normalizeText(a.title) !== normalizeText(b.title)) return false;
  const ua = canonicalListingUrl(a.sourceUrl), ub = canonicalListingUrl(b.sourceUrl);
  if (ua && ua === ub) return true;
  if (a.countries.length && b.countries.length && [...a.countries].sort().join(',') !== [...b.countries].sort().join(',')) return false;
  if (a.publishedAt && b.publishedAt && Math.abs(Date.parse(a.publishedAt)-Date.parse(b.publishedAt)) > 7*86400000) return false;
  const ta = new Set(tokenize(a.description.slice(0,1600))), tb = new Set(tokenize(b.description.slice(0,1600)));
  return ta.size >= 10 && tb.size >= 10 && jaccard(ta,tb) >= 0.95;
}

/** Provider buckets avoid scanning the whole expanded catalog for every item. */
export class ListingIndex<T extends ListingIdentity> {
  private byProvider = new Map<string,T[]>();
  private bySource = new Map<string,T>();
  constructor(rows: readonly T[] = []) { rows.forEach(r=>this.add(r)); }
  add(row:T) { const key=normalizeProvider(row.provider); const bucket=this.byProvider.get(key) ?? [];bucket.push(row);this.byProvider.set(key,bucket);this.bySource.set(`${row.sourceId}:${row.sourceItemId}`,row); }
  neighbors(row:T): T[] { const exact=this.bySource.get(`${row.sourceId}:${row.sourceItemId}`);return exact ? [exact,...(this.byProvider.get(normalizeProvider(row.provider)) ?? []).filter(x=>x!==exact)] : this.byProvider.get(normalizeProvider(row.provider)) ?? []; }
}

export interface DedupeOptions {
  /** Similarity at or above this is an exact duplicate (after provider check). */
  duplicateThreshold?: number;
  /** Similarity at or above this is a possible duplicate worth human review. */
  possibleThreshold?: number;
}

export function similarityBetween(a: OpportunityCandidate, b: OpportunityCandidate): number {
  const titleSim = jaccard(new Set(tokenize(a.title)), new Set(tokenize(b.title)));
  const provA = normalizeProvider(a.provider);
  const provB = normalizeProvider(b.provider);
  const sameProvider = provA.length > 0 && provA === provB;

  // Same posting text republished elsewhere keeps a high title overlap.
  const descSim = jaccard(new Set(tokenize(a.description.slice(0, 400))), new Set(tokenize(b.description.slice(0, 400))));

  const base = titleSim * 0.7 + descSim * 0.3;
  return Math.min(1, sameProvider ? base + 0.15 : base);
}

export function dedupeCandidate(
  candidate: OpportunityCandidate,
  existing: OpportunityCandidate[],
  options: DedupeOptions = {}
): DedupeResult {
  const duplicateThreshold = options.duplicateThreshold ?? 0.82;
  const possibleThreshold = options.possibleThreshold ?? 0.62;

  const fingerprint = fingerprintOf(candidate.provider, candidate.title);
  const normalizedKey = normalizedKeyOf(candidate.title);

  // Pass 1: same-source re-crawl of an identical posting. Always a duplicate.
  const sameSource = existing.find(
    e => e.sourceId === candidate.sourceId && e.sourceItemId === candidate.sourceItemId
  );
  if (sameSource) {
    return {
      verdict: 'duplicate',
      fingerprint,
      normalizedKey,
      matchedId: sameSource.id,
      similarity: 1,
      reason: `Same source item already ingested (${candidate.sourceId}#${candidate.sourceItemId}).`
    };
  }

  // Pass 2: identical provider + title, even across sources.
  const exact = existing.find(e => fingerprintOf(e.provider, e.title) === fingerprint && sameListing(candidate,e));
  if (exact) {
    return {
      verdict: 'duplicate',
      fingerprint,
      normalizedKey,
      matchedId: exact.id,
      similarity: 1,
      reason: 'Identical normalized provider and title already present.'
    };
  }

  // Pass 3: fuzzy match across sources.
  let best: { item: OpportunityCandidate; score: number } | null = null;
  for (const e of existing) {
    const score = similarityBetween(candidate, e);
    if (!best || score > best.score) best = { item: e, score };
  }

  if (best && best.score >= duplicateThreshold && sameListing(candidate,best.item)) {
    return {
      verdict: 'duplicate',
      fingerprint,
      normalizedKey,
      matchedId: best.item.id,
      similarity: Number(best.score.toFixed(4)),
      reason: `High title/description overlap (${best.score.toFixed(2)}) with an existing record.`
    };
  }

  if (best && best.score >= possibleThreshold) {
    return {
      verdict: 'possible-duplicate',
      fingerprint,
      normalizedKey,
      matchedId: best.item.id,
      similarity: Number(best.score.toFixed(4)),
      reason: `Partial overlap (${best.score.toFixed(2)}); retained but flagged for review.`
    };
  }

  return {
    verdict: 'unique',
    fingerprint,
    normalizedKey,
    matchedId: null,
    similarity: best ? Number(best.score.toFixed(4)) : 0,
    reason: 'No matching fingerprint or near-duplicate found.'
  };
}

/**
 * Choose which record of a duplicate pair to keep.
 * Prefer the one with more established evidence, then the richer description.
 */
export function preferCanonical(
  a: OpportunityCandidate,
  b: OpportunityCandidate
): { keep: OpportunityCandidate; drop: OpportunityCandidate; reason: string } {
  const established = (c: OpportunityCandidate) =>
    c.evidence.assertions.filter(x => x.method !== 'absent' && x.value !== null).length;
  const ea = established(a);
  const eb = established(b);

  if (ea !== eb) {
    const keep = ea > eb ? a : b;
    return {
      keep,
      drop: keep === a ? b : a,
      reason: `Kept the record with more established evidence (${Math.max(ea, eb)} vs ${Math.min(ea, eb)}).`
    };
  }

  const la = a.description.length;
  const lb = b.description.length;
  if (la !== lb) {
    const keep = la > lb ? a : b;
    return { keep, drop: keep === a ? b : a, reason: 'Kept the record with the fuller description.' };
  }

  const keep = a.discoveredAt <= b.discoveredAt ? a : b;
  return { keep, drop: keep === a ? b : a, reason: 'Evidence equivalent; kept the first-seen record.' };
}
