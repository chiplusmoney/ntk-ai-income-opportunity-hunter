import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EvidenceSnapshot, OpportunityCandidate, SourceDefinition } from '../src/types.js';
import { SOURCE_REGISTRY } from '../src/sources/registry.js';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Read a recorded fixture captured from the live provider. */
export function fixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf8');
}

export function fixtureJson<T>(name: string): T {
  return JSON.parse(fixture(name)) as T;
}

export function source(id: string): SourceDefinition {
  const found = SOURCE_REGISTRY.find(s => s.id === id);
  if (!found) throw new Error(`Test asked for unknown source ${id}`);
  return found;
}

export interface RecordedCall {
  url: string;
  headers: Record<string, string>;
}

/**
 * A fake `fetch` that serves recorded fixtures by URL substring, and records
 * every call so tests can assert the adapter honoured its endpoint.
 */
export function fixtureFetch(map: Record<string, string>): {
  fetchImpl: typeof fetch;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, headers: (init?.headers as Record<string, string>) ?? {} });

    const match = Object.keys(map).find(key => url.includes(key));
    if (!match) {
      return new Response('not found in fixture map', { status: 404, statusText: 'Not Found' });
    }
    return new Response(map[match] as string, {
      status: 200,
      headers: { 'content-type': match.endsWith('.xml') || map[match]?.startsWith('<?xml') ? 'text/xml' : 'application/json' }
    });
  }) as unknown as typeof fetch;

  return { fetchImpl, calls };
}

/** A fixed clock so runs are reproducible. */
export const FIXED_NOW = new Date('2026-10-14T12:00:00.000Z');

export function nowFn(date: Date = FIXED_NOW): () => Date {
  return () => date;
}

export function snapshot(overrides: Partial<EvidenceSnapshot> = {}): EvidenceSnapshot {
  return {
    sourceId: 'remotive',
    sourceUrl: 'https://example.test/job/1',
    fetchedAt: FIXED_NOW.toISOString(),
    contentHash: 'a'.repeat(64),
    bytes: 1024,
    httpStatus: 200,
    excerpt: 'excerpt',
    ...overrides
  };
}

/** Minimal candidate builder for stage tests. */
export function candidate(overrides: Partial<OpportunityCandidate> = {}): OpportunityCandidate {
  const base: OpportunityCandidate = {
    id: 'remotive:1',
    sourceId: 'remotive',
    sourceItemId: '1',
    title: 'Remote Frontend Developer',
    provider: 'Acme Ltd',
    category: 'Development',
    description:
      'Build a responsive marketing site with React. Fixed-price milestones paid on acceptance. Deliverables and scope agreed up front.',
    sourceUrl: 'https://example.test/job/1',
    discoveredAt: FIXED_NOW.toISOString(),
    publishedAt: FIXED_NOW.toISOString(),
    reward: { min: 2000, max: 4000, currency: 'USD', basis: 'one-off', raw: '$2,000 - $4,000' },
    remote: true,
    directPay: true,
    noCvRequired: 'unknown',
    noCapitalRequired: 'unknown',
    countries: ['GLOBAL'],
    eligibilityText: 'Worldwide',
    skills: ['React', 'TypeScript'],
    requirements: [],
    paymentMethods: ['Bank transfer'],
    deadline: null,
    competition: false,
    evidence: { snapshots: [snapshot()], assertions: [] },
    zeroCapital: null,
    eligibility: null,
    risk: null,
    scores: null,
    dedupe: null,
    visibility: 'draft',
    trace: []
  };
  return { ...base, ...overrides };
}
