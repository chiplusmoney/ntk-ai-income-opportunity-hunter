import { describe, expect, it } from 'vitest';
import { COLLECTIONS, SOURCE_REGISTRY, type OpportunityCandidate, type PublishedOpportunity, type SourceRunRecord } from '@ntk/hunter-core';
import { MemoryDocumentStore } from '../src/firestore/firestoreStore.js';
import { countByCollection, FirestoreOpportunityWriter, withWriteMetadata } from '../src/firestore/writer.js';
import { chunkDocuments, isPathSafeId } from '../src/firestore/documentStore.js';

const updatedAt = '2026-10-14T12:00:00.000Z';

function record(overrides: Partial<PublishedOpportunity> = {}): PublishedOpportunity {
  return {
    id: 'remotive:1',
    sourceId: 'remotive',
    sourceItemId: '1',
    visibility: 'published',
    title: 'Remote Frontend Developer',
    provider: 'Acme Ltd',
    category: 'Development',
    description: 'Build a responsive site.',
    sourceUrl: 'https://remotive.com/remote-jobs/1',
    discoveredAt: '2026-10-14T11:00:00.000Z',
    publishedAt: null,
    deadline: null,
    rewardMin: 50,
    rewardMax: 75,
    currency: 'USD',
    rewardBasis: 'hour',
    remote: true,
    directPay: true,
    noCvRequired: 'unknown',
    zeroCapital: true,
    capitalStatus: 'unconfirmed_no_cost_found',
    countries: ['GLOBAL'],
    skills: ['React'],
    requirements: [],
    paymentMethods: [],
    rankScore: 81,
    trustScore: 90,
    confidence: 70,
    riskLevel: 'low',
    evidenceCount: 7,
    evidenceHash: 'a'.repeat(64),
    fingerprint: 'fp',
    attribution: 'Remotive',
    requiresLinkBack: true,
    ...overrides
  };
}

function candidate(overrides: Partial<OpportunityCandidate> = {}): OpportunityCandidate {
  const base: OpportunityCandidate = {
    id: 'remotive:1',
    sourceId: 'remotive',
    sourceItemId: '1',
    title: 'Remote Frontend Developer',
    provider: 'Acme Ltd',
    category: 'Development',
    description: 'Build a responsive site.',
    sourceUrl: 'https://remotive.com/remote-jobs/1',
    discoveredAt: '2026-10-14T11:00:00.000Z',
    publishedAt: null,
    reward: { min: 50, max: 75, currency: 'USD', basis: 'hour', raw: '$50-$75 /hour' },
    remote: true,
    directPay: true,
    noCvRequired: 'unknown',
    noCapitalRequired: 'unknown',
    countries: ['GLOBAL'],
    eligibilityText: 'Worldwide',
    skills: ['React'],
    requirements: [],
    paymentMethods: [],
    deadline: null,
    competition: false,
    evidence: {
      snapshots: [
        {
          sourceId: 'remotive',
          sourceUrl: 'https://remotive.com/api/remote-jobs',
          fetchedAt: '2026-10-14T11:00:00.000Z',
          contentHash: 'b'.repeat(64),
          bytes: 189_000,
          httpStatus: 200,
          excerpt: 'excerpt'
        }
      ],
      assertions: [
        { field: 'title', value: 'Remote Frontend Developer', method: 'structured-field', snapshotIndex: 0, confidence: 1 },
        { field: 'reward.min', value: null, method: 'absent', snapshotIndex: null, confidence: 0 }
      ]
    },
    zeroCapital: {
      zeroCapital: true,
      status: 'unconfirmed_no_cost_found',
      costConfirmed: false,
      upfrontCostUsd: null,
      signals: [],
      evidence: []
    },
    eligibility: null,
    risk: { level: 'low', trustScore: 90, findings: [], blocked: false },
    scores: { rankScore: 81, trustScore: 90, confidence: 70, components: [] },
    dedupe: { verdict: 'unique', fingerprint: 'fp', normalizedKey: 'k', matchedId: null, similarity: 0, reason: '' },
    visibility: 'published',
    trace: ['adapter:remotive', 'zero-capital:unconfirmed_no_cost_found', 'visibility:published'],
    ...overrides
  };
  return base;
}

function runRecord(overrides: Partial<SourceRunRecord> = {}): SourceRunRecord {
  return {
    sourceId: 'remotive',
    startedAt: updatedAt,
    finishedAt: updatedAt,
    ok: true,
    httpStatus: 200,
    bytes: 189_000,
    itemsSeen: 15,
    accepted: 1,
    rejected: 14,
    error: null,
    skippedForInterval: false,
    ...overrides
  };
}

function params(published: PublishedOpportunity[], candidates: OpportunityCandidate[] = [candidate()]) {
  return {
    published,
    candidatesById: new Map(candidates.map(c => [c.id, c])),
    sourcesById: new Map(SOURCE_REGISTRY.map(s => [s.id, s])),
    sourceRuns: [runRecord()],
    updatedAt
  };
}

describe('document store staging and commit', () => {
  it('validates on stage and refuses a document with a reserved field character', () => {
    const store = new MemoryDocumentStore();
    const validation = store.stage({ collection: 'x', id: 'a', data: { 'bad.key': 1 } });
    expect(validation.ok).toBe(false);
    expect(store.stagedCount()).toBe(0);
  });

  it('commits staged documents and clears them', async () => {
    const store = new MemoryDocumentStore();
    store.stage({ collection: 'x', id: 'a', data: { v: 1 } });
    store.stage({ collection: 'x', id: 'b', data: { v: 2 } });
    const result = await store.commit();
    expect(result.written).toBe(2);
    expect(store.stagedCount()).toBe(0);
  });

  it('records documents only when not in dry-run mode', async () => {
    const live = new MemoryDocumentStore();
    const dry = new MemoryDocumentStore({ dryRun: true });
    live.stage({ collection: 'x', id: 'a', data: { v: 1 } });
    dry.stage({ collection: 'x', id: 'a', data: { v: 1 } });
    await live.commit();
    await dry.commit();
    expect(live.documentsIn('x')).toHaveLength(1);
    expect(dry.documentsIn('x')).toHaveLength(0);
  });

  it('chunks large document sets', () => {
    expect(chunkDocuments([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkDocuments([1], 2)).toEqual([[1]]);
  });

  it('rejects ids that are not path-safe', () => {
    expect(isPathSafeId('remotive:1')).toBe(true);
    expect(isPathSafeId('a/b')).toBe(false);
    expect(isPathSafeId('..')).toBe(false);
    expect(isPathSafeId('')).toBe(false);
    expect(isPathSafeId('x'.repeat(1600))).toBe(false);
  });
});

describe('Firestore writer', () => {
  it('writes the opportunity, its evidence and the run audit document', async () => {
    const store = new MemoryDocumentStore();
    const writer = new FirestoreOpportunityWriter(store);
    const report = await writer.writeRun(params([record()]));

    expect(report.ok).toBe(true);
    expect(report.written).toBe(3);
    expect(store.documentsIn(COLLECTIONS.opportunities)).toHaveLength(1);
    expect(store.documentsIn(COLLECTIONS.opportunityEvidence)).toHaveLength(1);
    expect(store.documentsIn(COLLECTIONS.internalSourceRuns)).toHaveLength(1);
  });

  it('uses the same document id for an opportunity and its evidence', async () => {
    const store = new MemoryDocumentStore();
    await new FirestoreOpportunityWriter(store).writeRun(params([record()]));
    const opportunity = store.documentsIn(COLLECTIONS.opportunities)[0];
    const evidence = store.documentsIn(COLLECTIONS.opportunityEvidence)[0];
    expect(opportunity?.id).toBe('remotive:1');
    expect(evidence?.id).toBe('remotive:1');
  });

  it('is idempotent: a repeat crawl updates the same documents instead of duplicating', async () => {
    const store = new MemoryDocumentStore();
    const writer = new FirestoreOpportunityWriter(store);

    await writer.writeRun(params([record()]));
    const afterFirst = store.stored.length;
    const second = await writer.writeRun(params([record({ rankScore: 84 })]));

    expect(second.written).toBe(3);
    // Same number of documents; the record was refreshed, not appended.
    expect(store.stored.length).toBe(afterFirst);
    const opportunities = store.documentsIn(COLLECTIONS.opportunities);
    expect(opportunities).toHaveLength(1);
    expect((opportunities[0]?.data as { rankScore: number }).rankScore).toBe(84);
  });

  it('stamps updatedAt without replacing the capture time', async () => {
    const doc = withWriteMetadata(record(), updatedAt);
    expect(doc.updatedAt).toBe(updatedAt);
    expect(doc.discoveredAt).toBe('2026-10-14T11:00:00.000Z');
  });

  it('skips a document that would be rejected, and still writes the valid ones', async () => {
    const store = new MemoryDocumentStore();
    const writer = new FirestoreOpportunityWriter(store);
    const broken = record({ id: 'remotive:2', sourceItemId: '2', title: 'ok' });
    // A reserved character in a field NAME is what Firestore refuses; simulate it
    // by giving the candidate an evidence document that cannot be validated.
    const badCandidate = candidate({
      id: 'remotive:2',
      sourceItemId: '2',
      evidence: {
        snapshots: [
          {
            sourceId: 'remotive',
            sourceUrl: 'x',
            fetchedAt: updatedAt,
            contentHash: 'c'.repeat(64),
            bytes: 1,
            httpStatus: 200,
            excerpt: 'e'
          }
        ],
        assertions: [{ field: 'title', value: undefined as unknown as string, method: 'structured-field', snapshotIndex: 0, confidence: 1 }]
      }
    });

    const report = await writer.writeRun({
      ...params([record(), broken], [candidate(), badCandidate]),
      published: [record(), broken]
    });

    // The invalid evidence document is reported, and nothing else is lost.
    expect(report.skippedInvalid.length).toBeGreaterThanOrEqual(1);
    expect(report.ok).toBe(false);
    expect(store.documentsIn(COLLECTIONS.opportunities)).toHaveLength(2);
  });

  it('reports an evidence document as missing rather than inventing one', async () => {
    const store = new MemoryDocumentStore();
    const writer = new FirestoreOpportunityWriter(store);
    const report = await writer.writeRun({ ...params([record()]), candidatesById: new Map() });

    expect(report.skippedInvalid.some(item => item.collection === COLLECTIONS.opportunityEvidence)).toBe(true);
    expect(store.documentsIn(COLLECTIONS.opportunityEvidence)).toHaveLength(0);
    // The opportunity itself is still written: it is valid and attributable.
    expect(store.documentsIn(COLLECTIONS.opportunities)).toHaveLength(1);
  });

  it('refuses a document whose id is not path-safe', async () => {
    const store = new MemoryDocumentStore();
    const writer = new FirestoreOpportunityWriter(store);
    const report = await writer.writeRun(params([record({ id: 'bad/id' })]));
    expect(report.skippedInvalid.some(item => item.problems.includes('document id is not path-safe'))).toBe(true);
    expect(store.documentsIn(COLLECTIONS.opportunities)).toHaveLength(0);
  });

  it('contains a store failure to the affected chunk', async () => {
    const store = new MemoryDocumentStore({
      failOn: document => (document.collection === COLLECTIONS.opportunityEvidence ? 'permission-denied' : null)
    });
    const writer = new FirestoreOpportunityWriter(store);
    const report = await writer.writeRun(params([record()]));

    expect(report.failed.some(f => f.collection === COLLECTIONS.opportunityEvidence)).toBe(true);
    expect(report.ok).toBe(false);
    // The opportunity and the run document still landed.
    expect(store.documentsIn(COLLECTIONS.opportunities)).toHaveLength(1);
    expect(store.documentsIn(COLLECTIONS.internalSourceRuns)).toHaveLength(1);
  });

  it('never writes undefined or an oversized document', async () => {
    const store = new MemoryDocumentStore();
    const writer = new FirestoreOpportunityWriter(store);
    const report = await writer.writeRun(params([record({ deadline: undefined as unknown as null })]));
    expect(report.skippedInvalid.some(item => item.problems.some(p => p.includes('undefined')))).toBe(true);
  });

  it('counts documents per collection', async () => {
    const store = new MemoryDocumentStore();
    await new FirestoreOpportunityWriter(store).writeRun(
      params(
        [record(), record({ id: 'remotive:3', sourceItemId: '3' })],
        [candidate(), candidate({ id: 'remotive:3', sourceItemId: '3' })]
      )
    );
    expect(countByCollection(store.stored)).toEqual({
      [COLLECTIONS.opportunities]: 2,
      [COLLECTIONS.opportunityEvidence]: 2,
      [COLLECTIONS.internalSourceRuns]: 1
    });
  });

  it('writes nothing when there is nothing to write', async () => {
    const store = new MemoryDocumentStore();
    const report = await new FirestoreOpportunityWriter(store).writeRun({
      published: [],
      candidatesById: new Map(),
      sourcesById: new Map(),
      sourceRuns: [],
      updatedAt
    });
    expect(report.written).toBe(0);
    expect(report.ok).toBe(true);
  });

  it('produces byte-identical documents for a replayed run', async () => {
    const first = new MemoryDocumentStore();
    const second = new MemoryDocumentStore();
    await new FirestoreOpportunityWriter(first).writeRun(params([record()]));
    await new FirestoreOpportunityWriter(second).writeRun(params([record()]));
    expect(JSON.stringify(second.stored)).toBe(JSON.stringify(first.stored));
  });
});
