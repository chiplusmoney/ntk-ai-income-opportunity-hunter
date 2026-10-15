import { describe, expect, it } from 'vitest';
import {
  COLLECTIONS,
  runDocId,
  toFirestoreEvidenceDoc,
  toFirestoreOpportunityDoc,
  toFirestoreRunDoc,
  validateFirestoreDocument
} from '../src/persistence/firestoreDocuments.js';
import { runHunt } from '../src/pipeline/run.js';
import { processCandidate, toPublished } from '../src/pipeline/run.js';
import { DEFAULT_WEIGHTS } from '../src/pipeline/scoring.js';
import { DEFAULT_ELIGIBILITY_PREFERENCES } from '../src/pipeline/eligibility.js';
import { SOURCE_REGISTRY } from '../src/sources/registry.js';
import { remotiveAdapter } from '../src/sources/adapters/index.js';
import { candidate, FIXED_NOW, fixture, fixtureFetch } from './helpers.js';

const ALL_FIXTURES: Record<string, string> = {
  'remotive.com/api/remote-jobs': fixture('remotive.json'),
  'remoteok.com/api': fixture('remoteok.json'),
  'arbeitnow.com/api/job-board-api': fixture('arbeitnow.json'),
  'api.github.com/search/issues': fixture('github-bounties.json'),
  'hn.algolia.com': fixture('hn-freelancer.json')
};

async function realRun() {
  const { fetchImpl } = fixtureFetch(ALL_FIXTURES);
  return runHunt({ sources: SOURCE_REGISTRY, fetchImpl, now: FIXED_NOW, force: true });
}

describe('collection names', () => {
  it('match the documented data model', () => {
    expect(COLLECTIONS.opportunities).toBe('opportunities');
    expect(COLLECTIONS.opportunityEvidence).toBe('opportunityEvidence');
    // Top-level, because `internal/sourceRuns/{id}` is not an addressable
    // Firestore document path (it would parse `{id}` as a collection).
    expect(COLLECTIONS.internalSourceRuns).toBe('internalSourceRuns');
  });
});

describe('toFirestoreOpportunityDoc', () => {
  it('produces a document whose fields match the published contract', async () => {
    const result = await realRun();
    const record = result.published[0]!;
    const doc = toFirestoreOpportunityDoc(record);
    expect(doc.visibility).toBe('published');
    expect(doc.zeroCapital).toBe(true);
    expect(doc.rankScore).toBe(record.rankScore);
    expect(doc.id).toBe(record.id);
  });

  it('is Firestore-safe for every published record in a real run', async () => {
    const result = await realRun();
    for (const record of result.published) {
      const validation = validateFirestoreDocument(toFirestoreOpportunityDoc(record));
      expect(validation.problems, `${record.id}: ${validation.problems.join('; ')}`).toEqual([]);
      expect(validation.bytes).toBeLessThan(900_000);
    }
  });

  it('keeps every indexed field present, because a missing index field is unqueryable', async () => {
    const result = await realRun();
    for (const record of result.published) {
      const doc = toFirestoreOpportunityDoc(record);
      expect(doc.visibility).toBeTruthy();
      expect(doc.zeroCapital).toBe(true);
      expect(typeof doc.rankScore).toBe('number');
      expect(doc.category).toBeTruthy();
      expect(doc.discoveredAt).toBeTruthy();
    }
  });
});

describe('toFirestoreEvidenceDoc', () => {
  it('records the hash, the bounded excerpt and the assertion count', async () => {
    const source = SOURCE_REGISTRY.find(s => s.id === 'remotive')!;
    const { fetchImpl } = fixtureFetch({ 'remotive.com/api/remote-jobs': fixture('remotive.json') });
    const adapted = await remotiveAdapter.run({ fetchImpl, now: () => FIXED_NOW });
    const { candidate: processed } = processCandidate({
      candidate: adapted.candidates[0]!,
      source,
      existing: [],
      prefs: DEFAULT_ELIGIBILITY_PREFERENCES,
      weights: DEFAULT_WEIGHTS,
      userSkills: [],
      history: {},
      now: FIXED_NOW
    });
    const record = await toPublished(processed, source);
    const doc = toFirestoreEvidenceDoc(processed, record, source, FIXED_NOW.toISOString());

    expect(doc.opportunityId).toBe(record.id);
    expect(doc.evidenceHash).toBe(record.evidenceHash);
    expect(doc.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(doc.excerpt.length).toBeLessThanOrEqual(1200);
    // A real adapted candidate always carries assertions, established or absent.
    expect(doc.totalAssertions).toBeGreaterThan(0);
    expect(doc.unknownFieldCount).toBeGreaterThan(0);
    expect(doc.attribution).toBe(source.attribution);
    expect(doc.requiresLinkBack).toBe(true);
    expect(doc.pipelineTrace.length).toBeGreaterThan(0);
    expect(validateFirestoreDocument(doc).problems).toEqual([]);
  });

  it('never stores a field name with a reserved character', async () => {
    const source = SOURCE_REGISTRY[0]!;
    const { candidate: processed } = processCandidate({
      candidate: candidate({
        evidence: {
          snapshots: [
            {
              sourceId: 'remotive',
              sourceUrl: 'https://example.test/1',
              fetchedAt: FIXED_NOW.toISOString(),
              contentHash: 'd'.repeat(64),
              bytes: 12,
              httpStatus: 200,
              excerpt: 'e'
            }
          ],
          assertions: [
            { field: 'reward.min', value: 10, method: 'structured-field', snapshotIndex: 0, confidence: 1 }
          ]
        }
      }),
      source,
      existing: [],
      prefs: DEFAULT_ELIGIBILITY_PREFERENCES,
      weights: DEFAULT_WEIGHTS,
      userSkills: [],
      history: {},
      now: FIXED_NOW
    });
    const record = await toPublished(processed, source);
    const doc = toFirestoreEvidenceDoc(processed, record, source, FIXED_NOW.toISOString());
    const validation = validateFirestoreDocument(doc);
    expect(validation.problems).toEqual([]);
    // 'reward.min' is a VALUE here, not a key, so the reserved '.' is fine.
    expect(doc.assertions.some(a => a.field === 'reward.min')).toBe(true);
  });
});

describe('toFirestoreRunDoc', () => {
  it('stores one document per source per run with a stable id', async () => {
    const result = await realRun();
    for (const run of result.sourceRuns) {
      const doc = toFirestoreRunDoc(run);
      expect(doc.id).toBe(runDocId(run.sourceId, run.startedAt));
      expect(validateFirestoreDocument(doc).problems).toEqual([]);
    }
  });

  it('replaces the colons in the timestamp so the id is path-safe', () => {
    expect(runDocId('remotive', '2026-10-14T12:00:00.000Z')).toBe('remotive_2026-10-14T12-00-00-000Z');
  });
});

describe('validateFirestoreDocument', () => {
  it('rejects a field name containing a dot', () => {
    const result = validateFirestoreDocument({ 'reward.min': 1 });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/reserved character/);
  });

  it('rejects undefined values that JSON.stringify would hide', () => {
    const result = validateFirestoreDocument({ a: undefined });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/undefined/);
  });

  it('rejects non-finite numbers', () => {
    const result = validateFirestoreDocument({ a: Number.NaN, b: Number.POSITIVE_INFINITY });
    expect(result.ok).toBe(false);
    expect(result.problems.length).toBe(2);
  });

  it('accepts a null value, which Firestore stores fine', () => {
    expect(validateFirestoreDocument({ a: null }).ok).toBe(true);
  });

  it('rejects an oversized document', () => {
    const result = validateFirestoreDocument({ blob: 'x'.repeat(1_100_000) });
    expect(result.ok).toBe(false);
    expect(result.problems.some(p => p.includes('document limit'))).toBe(true);
  });

  it('accepts the published documents a real run produces', async () => {
    const result = await realRun();
    expect(result.published.length).toBeGreaterThan(0);
    for (const record of result.published) {
      expect(validateFirestoreDocument(toFirestoreOpportunityDoc(record)).ok).toBe(true);
    }
  });
});
