import { describe, expect, it, vi } from 'vitest';
import { HybridOpportunityRepository, type OpportunityCache, type OpportunityGateway } from './opportunityRepository';
import { mapPublishedOpportunity } from './mapPublishedOpportunity';
import type { FirestoreEvidenceDoc, PublishedOpportunity } from '@ntk/hunter-core';
import type { Opportunity } from '../types';

const NOW = new Date('2026-10-14T12:00:00.000Z');

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

function makeCache(initial: Opportunity[] = []) {
  const writes: Opportunity[][] = [];
  const cache: OpportunityCache = {
    read: vi.fn(async () => initial),
    write: vi.fn(async items => {
      writes.push(items);
    })
  };
  return { cache, writes };
}

function makeGateway(records: PublishedOpportunity[], evidence: FirestoreEvidenceDoc | null = null): OpportunityGateway {
  return {
    listPublished: vi.fn(async () => records),
    getEvidence: vi.fn(async () => evidence)
  };
}

function makeRepo(options: { gateway: OpportunityGateway | null; cache: OpportunityCache; online?: boolean }) {
  return new HybridOpportunityRepository({
    gateway: options.gateway,
    cache: options.cache,
    map: (r, e) => mapPublishedOpportunity(r, { now: NOW, evidence: e }),
    now: () => NOW,
    isOnline: () => options.online ?? true
  });
}

describe('HybridOpportunityRepository', () => {
  it('serves live records, maps them and refreshes the cache', async () => {
    const { cache, writes } = makeCache();
    const repository = makeRepo({ gateway: makeGateway([record()]), cache });

    const result = await repository.listBest(10);

    expect(result.source).toBe('live');
    expect(result.error).toBeNull();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.title).toBe('Remote Frontend Developer');
    expect(result.items[0]?.rewardText).toBe('$50 – $75 per hour');
    expect(writes[0]).toHaveLength(1);
  });

  it('attaches the evidence document to the mapped record', async () => {
    const { cache } = makeCache();
    const evidence = { contentHash: 'c'.repeat(64), unknownFieldCount: 3, totalAssertions: 9 } as FirestoreEvidenceDoc;
    const repository = makeRepo({ gateway: makeGateway([record()], evidence), cache });

    const result = await repository.listBest(1);

    const hashLine = result.items[0]?.evidence.find(l => l.label === 'Snapshot hash');
    expect(hashLine?.value).toContain('cccccccccccccccc');
    expect(result.items[0]?.evidence.find(l => l.label === 'Unconfirmed fields')?.value).toBe(
      '3 of 9 assertions are absent'
    );
  });

  it('serves the cache when offline and never calls the gateway', async () => {
    const cached = [mapPublishedOpportunity(record(), { now: NOW })];
    const { cache } = makeCache(cached);
    const gateway = makeGateway([record()]);
    const repository = makeRepo({ gateway, cache, online: false });

    const result = await repository.listBest(10);

    expect(result.source).toBe('cache');
    expect(result.items).toHaveLength(1);
    expect(gateway.listPublished).not.toHaveBeenCalled();
  });

  it('falls back to the cache when the live read fails, and reports the error', async () => {
    const cached = [mapPublishedOpportunity(record(), { now: NOW })];
    const { cache } = makeCache(cached);
    const gateway: OpportunityGateway = {
      listPublished: vi.fn(async () => {
        throw new Error('permission-denied');
      }),
      getEvidence: vi.fn(async () => null)
    };
    const repository = makeRepo({ gateway, cache });

    const result = await repository.listBest(10);

    expect(result.source).toBe('cache');
    expect(result.error).toBe('permission-denied');
    expect(result.items).toHaveLength(1);
  });

  it('treats an empty live result as a real answer instead of masking it with cache', async () => {
    const cached = [mapPublishedOpportunity(record(), { now: NOW })];
    const { cache } = makeCache(cached);
    const repository = makeRepo({ gateway: makeGateway([]), cache });

    const result = await repository.listBest(10);

    expect(result.source).toBe('live');
    expect(result.items).toHaveLength(0);
  });

  it('reports empty when there is neither a gateway nor a cache', async () => {
    const { cache } = makeCache([]);
    const repository = makeRepo({ gateway: null, cache });

    const result = await repository.listBest(10);

    expect(result.source).toBe('empty');
    expect(result.items).toEqual([]);
    expect(result.error).toBeNull();
  });

  it('survives a cache read failure and a cache write failure', async () => {
    const failingCache: OpportunityCache = {
      read: vi.fn(async () => {
        throw new Error('idb blocked');
      }),
      write: vi.fn(async () => {
        throw new Error('quota exceeded');
      })
    };
    const offline = makeRepo({ gateway: makeGateway([record()]), cache: failingCache, online: false });
    expect((await offline.listBest(5)).source).toBe('empty');

    const online = makeRepo({ gateway: makeGateway([record()]), cache: failingCache });
    expect((await online.listBest(5)).source).toBe('live');
  });

  it('does not fail the whole list when one evidence read fails', async () => {
    const { cache } = makeCache();
    const gateway: OpportunityGateway = {
      listPublished: vi.fn(async () => [record({ id: 'a' }), record({ id: 'b' })]),
      getEvidence: vi.fn(async () => {
        throw new Error('evidence unavailable');
      })
    };
    const repository = makeRepo({ gateway, cache });

    const result = await repository.listBest(5);

    expect(result.source).toBe('live');
    expect(result.items).toHaveLength(2);
  });

  it('passes the requested maximum to the gateway', async () => {
    const { cache } = makeCache();
    const gateway = makeGateway([record()]);
    const repository = makeRepo({ gateway, cache });

    await repository.listBest(7);

    expect(gateway.listPublished).toHaveBeenCalledWith(7);
  });
});
