import { describe, expect, it } from 'vitest';
import { ADAPTERS, arbeitnowAdapter, devpostAdapter, freelancerRssAdapter, githubBountiesAdapter, hnFreelancerAdapter, remoteOkAdapter, remotiveAdapter, servableAdapters } from '../src/sources/adapters/index.js';
import { parsePrizeAmount, parseSubmissionDeadline } from '../src/sources/adapters/devpost.js';
import { parseBudgetClause } from '../src/sources/adapters/freelancerRss.js';
import { parseRss } from '../src/sources/adapters/rss.js';
import { SOURCE_REGISTRY, isServable } from '../src/sources/registry.js';
import { FIXED_NOW, fixture, fixtureFetch, nowFn } from './helpers.js';
import type { SourceFetchResult } from '../src/types.js';

const context = (map: Record<string, string>) => {
  const { fetchImpl, calls } = fixtureFetch(map);
  return { ctx: { fetchImpl, now: nowFn(FIXED_NOW), userAgent: 'test' }, calls };
};

/** Every adapter run in this file, reused by the invariant checks below. */
const runs: { name: string; result: SourceFetchResult }[] = [];

async function runAdapter(
  name: string,
  adapter: { run: (ctx: { fetchImpl: typeof fetch; now: () => Date }) => Promise<SourceFetchResult> },
  map: Record<string, string>
): Promise<SourceFetchResult> {
  const { ctx } = context(map);
  const result = await adapter.run(ctx as never);
  runs.push({ name, result });
  return result;
}

describe('remotive adapter', () => {
  const map = { 'remotive.com/api/remote-jobs': fixture('remotive.json') };

  it('reads the documented endpoint and returns one candidate per job', async () => {
    const { ctx, calls } = context(map);
    const result = await remotiveAdapter.run(ctx as never);
    expect(calls[0]?.url).toBe('https://remotive.com/api/remote-jobs');
    expect(result.ok).toBe(true);
    expect(result.candidates).toHaveLength(3);
    expect(result.itemsSeen).toBe(3);
  });

  it('keeps an unpublished salary unknown rather than zero', async () => {
    const result = await runAdapter('remotive', remotiveAdapter, map);
    const noSalary = result.candidates.find(c => c.reward.raw === null);
    expect(noSalary).toBeDefined();
    expect(noSalary?.reward.min).toBeNull();
    expect(noSalary?.reward.max).toBeNull();
    expect(noSalary?.reward.currency).toBeNull();
  });

  it('parses a published salary range and keeps the verbatim text', async () => {
    const result = await runAdapter('remotive', remotiveAdapter, map);
    const paid = result.candidates.find(c => c.reward.min !== null);
    expect(paid).toBeDefined();
    expect(paid?.reward.min).toBeGreaterThan(0);
    expect(paid?.reward.raw?.length).toBeGreaterThan(0);
  });

  it('leaves remote status unknown because the feed does not publish it', async () => {
    const result = await runAdapter('remotive', remotiveAdapter, map);
    expect(result.candidates.every(c => c.remote === 'unknown')).toBe(true);
  });

  it('links every candidate back to its remotive.com job URL', async () => {
    const result = await runAdapter('remotive', remotiveAdapter, map);
    expect(result.candidates.every(c => c.sourceUrl.startsWith('https://remotive.com/'))).toBe(true);
  });

  it('records missing fields as absent assertions', async () => {
    const result = await runAdapter('remotive', remotiveAdapter, map);
    const noSalary = result.candidates.find(c => c.reward.raw === null);
    const assertion = noSalary?.evidence.assertions.find(a => a.field === 'reward.min');
    expect(assertion?.method).toBe('absent');
    expect(assertion?.value).toBeNull();
  });
});

describe('remote ok adapter', () => {
  const map = { 'remoteok.com/api': fixture('remoteok.json') };

  it('skips the leading legal-notice element', async () => {
    const result = await runAdapter('remoteok', remoteOkAdapter, map);
    expect(result.ok).toBe(true);
    // The fixture holds the notice plus two jobs.
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.some(c => c.title.includes('Terms of Service'))).toBe(false);
  });

  it('reads numeric salary bounds but refuses to guess currency or period', async () => {
    const result = await runAdapter('remoteok', remoteOkAdapter, map);
    const paid = result.candidates.find(c => c.reward.min !== null);
    expect(paid).toBeDefined();
    expect(paid?.reward.currency).toBeNull();
    expect(paid?.reward.basis).toBe('unknown');
  });

  it('only asserts remote when the location literally says Remote', async () => {
    const result = await runAdapter('remoteok', remoteOkAdapter, map);
    for (const c of result.candidates) {
      if (c.remote === true) expect(c.eligibilityText?.toLowerCase()).toBe('remote');
    }
  });
});

describe('arbeitnow adapter', () => {
  const map = { 'arbeitnow.com/api/job-board-api': fixture('arbeitnow.json') };

  it('maps the published remote boolean in both directions', async () => {
    const result = await runAdapter('arbeitnow', arbeitnowAdapter, map);
    expect(result.ok).toBe(true);
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.candidates.some(c => c.remote === true)).toBe(true);
    expect(result.candidates.some(c => c.remote === false)).toBe(true);
  });

  it('states an on-site role as positively on-site', async () => {
    const result = await runAdapter('arbeitnow', arbeitnowAdapter, map);
    const onSite = result.candidates.find(c => c.remote === false);
    const assertion = onSite?.evidence.assertions.find(a => a.field === 'remote');
    expect(assertion?.method).toBe('structured-field');
    expect(assertion?.value).toBe(false);
  });

  it('does not invent a country from a city name', async () => {
    const result = await runAdapter('arbeitnow', arbeitnowAdapter, map);
    expect(result.candidates.every(c => c.countries.length === 0 || c.countries.every(x => x !== 'DE'))).toBe(true);
  });
});

describe('github bounty adapter', () => {
  const map = { 'api.github.com/search/issues': fixture('github-bounties.json') };

  it('queries the search API with the bounty label and a version header', async () => {
    const { ctx, calls } = context(map);
    await githubBountiesAdapter.run(ctx as never);
    expect(calls[0]?.url).toContain('api.github.com/search/issues');
    expect(calls[0]?.url).toContain('label%3Abounty');
    expect(calls[0]?.headers['x-github-api-version']).toBeDefined();
  });

  it('never asserts a reward, because GitHub publishes no payout field', async () => {
    const result = await runAdapter('github-bounties', githubBountiesAdapter, map);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every(c => c.reward.min === null && c.reward.max === null)).toBe(true);
    expect(result.candidates.every(c => c.directPay === 'unknown')).toBe(true);
  });

  it('records the bounty amount as unverified rather than trusting the label', async () => {
    const result = await runAdapter('github-bounties', githubBountiesAdapter, map);
    const claim = result.candidates[0]?.evidence.assertions.find(a => a.field === 'rewardClaim');
    expect(claim?.value).toBe('unverified');
  });

  it('links to the issue page and names the owner/repo as provider', async () => {
    const result = await runAdapter('github-bounties', githubBountiesAdapter, map);
    for (const c of result.candidates) {
      expect(c.sourceUrl).toContain('github.com');
      expect(c.provider).toMatch(/^[^/]+\/[^/]+$/);
    }
  });
});

describe('hacker news adapter', () => {
  const map = { 'hn.algolia.com': fixture('hn-freelancer.json') };

  it('links to the Hacker News item, never to the search API', async () => {
    const result = await runAdapter('hn-freelancer', hnFreelancerAdapter, map);
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const c of result.candidates) {
      expect(c.sourceUrl).toMatch(/^https:\/\/news\.ycombinator\.com\/item\?id=\d+$/);
    }
  });

  it('leaves pay unknown', async () => {
    const result = await runAdapter('hn-freelancer', hnFreelancerAdapter, map);
    expect(result.candidates.every(c => c.reward.min === null && c.directPay === 'unknown')).toBe(true);
  });
});

describe('freelancer rss adapter', () => {
  const map = { 'freelancer.com/rss.xml': fixture('freelancer-rss.xml') };

  it('parses the channel and its items', () => {
    const channel = parseRss(fixture('freelancer-rss.xml'));
    expect(channel.items).toHaveLength(2);
    expect(channel.items.every(i => i.link?.startsWith('https://www.freelancer.com/projects/'))).toBe(true);
  });

  it('reads the real budget clause instead of inferring a title', async () => {
    const result = await runAdapter('freelancer-rss', freelancerRssAdapter, map);
    expect(result.candidates).toHaveLength(2);
    // The earlier assumption that titles are missing was wrong: all items have one.
    expect(result.candidates.every(c => c.title.length > 0)).toBe(true);
    expect(result.candidates.some(c => c.reward.min !== null)).toBe(true);
  });

  it('treats a stated budget as direct pay for delivered work', async () => {
    const result = await runAdapter('freelancer-rss', freelancerRssAdapter, map);
    expect(result.candidates.every(c => c.directPay === true)).toBe(true);
  });

  it('parses currency from the budget text', () => {
    const parsed = parseBudgetClause('Some text (Budget: €100 - €1000 EUR, Jobs: 3D Animation, 3D Design)');
    expect(parsed.matched).toBe(true);
    expect(parsed.reward.currency).toBe('EUR');
    expect(parsed.reward.min).toBe(100);
    expect(parsed.skills).toContain('3D Animation');
  });

  it('reports no budget when the clause is absent', () => {
    const parsed = parseBudgetClause('A description with no budget information at all.');
    expect(parsed.matched).toBe(false);
    expect(parsed.reward.min).toBeNull();
  });
});

describe('devpost adapter', () => {
  const map = { 'devpost.com/api/hackathons': fixture('devpost.json') };

  it('parses the HTML-wrapped USD prize', () => {
    const parsed = parsePrizeAmount('$<span data-currency-value>138,000</span>');
    expect(parsed.min).toBe(138000);
    expect(parsed.max).toBe(138000);
    expect(parsed.currency).toBe('USD');
    expect(parsed.raw).toContain('data-currency-value');
  });

  it('parses a non-USD prize without converting it', () => {
    const parsed = parsePrizeAmount('₹ <span data-currency-value>100,000</span>');
    expect(parsed.currency).toBe('INR');
    expect(parsed.min).toBe(100000);
  });

  it('returns unknown for a missing fragment', () => {
    expect(parsePrizeAmount(null)).toEqual({ raw: null, min: null, max: null, currency: null });
  });

  it('reads the closing date out of the submission window', () => {
    expect(parseSubmissionDeadline('Aug 31 - Oct 23, 2026')).toBe('2026-10-23T23:59:59.000Z');
    expect(parseSubmissionDeadline('no window')).toBeNull();
  });

  it('marks hackathons as competitions with a prize, not a fee', async () => {
    const result = await runAdapter('devpost', devpostAdapter, map);
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    for (const c of result.candidates) {
      expect(c.competition).toBe(true);
      expect(c.directPay).toBe(false);
      expect(c.category).toBe('Competition');
    }
  });
});

describe('adapter invariants (all adapters, recorded payloads)', () => {
  it('runs every adapter against its fixture without throwing', async () => {
    await runAdapter('remotive', remotiveAdapter, { 'remotive.com/api/remote-jobs': fixture('remotive.json') });
    await runAdapter('remoteok', remoteOkAdapter, { 'remoteok.com/api': fixture('remoteok.json') });
    await runAdapter('arbeitnow', arbeitnowAdapter, { 'arbeitnow.com/api/job-board-api': fixture('arbeitnow.json') });
    await runAdapter('github-bounties', githubBountiesAdapter, { 'api.github.com/search/issues': fixture('github-bounties.json') });
    await runAdapter('hn-freelancer', hnFreelancerAdapter, { 'hn.algolia.com': fixture('hn-freelancer.json') });
    await runAdapter('freelancer-rss', freelancerRssAdapter, { 'freelancer.com/rss.xml': fixture('freelancer-rss.xml') });
    await runAdapter('devpost', devpostAdapter, { 'devpost.com/api/hackathons': fixture('devpost.json') });
    expect(runs.length).toBeGreaterThanOrEqual(7);
    expect(runs.every(r => r.result.ok)).toBe(true);
  });

  it('builds ids as sourceId:sourceItemId and attaches at least one snapshot', () => {
    for (const { name, result } of runs) {
      for (const c of result.candidates) {
        expect(c.id, `${name} candidate id`).toBe(`${c.sourceId}:${c.sourceItemId}`);
        expect(c.evidence.snapshots.length, `${name} snapshots`).toBeGreaterThan(0);
      }
    }
  });

  it('only ever points assertions at a snapshot that exists', () => {
    for (const { name, result } of runs) {
      for (const c of result.candidates) {
        for (const a of c.evidence.assertions) {
          if (a.snapshotIndex === null) continue;
          expect(a.snapshotIndex, `${name} assertion ${a.field}`).toBeLessThan(c.evidence.snapshots.length);
          expect(a.snapshotIndex).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('never leaves a field both established and absent', () => {
    for (const { name, result } of runs) {
      for (const c of result.candidates) {
        const established = c.evidence.assertions.filter(a => a.method !== 'absent').map(a => a.field);
        const absent = c.evidence.assertions.filter(a => a.method === 'absent').map(a => a.field);
        const overlap = established.filter(f => absent.includes(f));
        expect(overlap, `${name} conflicting fields`).toEqual([]);
      }
    }
  });

  it('hashes the payload it actually received', () => {
    for (const { name, result } of runs) {
      for (const c of result.candidates) {
        for (const s of c.evidence.snapshots) {
          expect(s.contentHash, `${name} hash`).toMatch(/^[0-9a-f]{64}$/);
          expect(s.bytes).toBeGreaterThan(0);
          expect(s.httpStatus).toBe(200);
        }
      }
    }
  });

  it('stamps discovery time from the injected clock', () => {
    for (const { result } of runs) {
      for (const c of result.candidates) {
        expect(c.discoveredAt).toBe(FIXED_NOW.toISOString());
        expect(c.visibility).toBe('draft');
      }
    }
  });
});

describe('registry vs adapters', () => {
  it('has an adapter for every registered source', () => {
    for (const source of SOURCE_REGISTRY) {
      expect(ADAPTERS.some(a => a.sourceId === source.id), `adapter for ${source.id}`).toBe(true);
    }
  });

  it('only serves sources whose terms were read', () => {
    for (const adapter of servableAdapters()) {
      const source = SOURCE_REGISTRY.find(s => s.id === adapter.sourceId);
      expect(source?.termsReviewed).toBe(true);
      expect(isServable(source!)).toBe(true);
    }
    expect(servableAdapters().length).toBeGreaterThanOrEqual(3);
  });

  it('keeps every unverified source switched off with a reason', () => {
    for (const source of SOURCE_REGISTRY) {
      if (source.termsReviewed) continue;
      expect(source.enabled).toBe(false);
      expect(source.disabledReason, `${source.id} disabledReason`).toBeTruthy();
      expect(isServable(source)).toBe(false);
    }
  });

  it('sets a crawl interval that respects the provider request guidance', () => {
    const remotive = SOURCE_REGISTRY.find(s => s.id === 'remotive');
    // Remotive asks for a maximum of ~4 requests/day: 1440/4 = 360 minutes.
    expect(remotive?.minIntervalMinutes).toBeGreaterThanOrEqual(360);
    for (const source of SOURCE_REGISTRY) {
      expect(source.minIntervalMinutes).toBeGreaterThanOrEqual(30);
    }
  });
});
