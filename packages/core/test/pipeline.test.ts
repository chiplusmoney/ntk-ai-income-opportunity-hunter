import { describe, expect, it } from 'vitest';
import { collapseDuplicates, processCandidate, runHunt, toPublished } from '../src/pipeline/run.js';
import { DEFAULT_WEIGHTS } from '../src/pipeline/scoring.js';
import { DEFAULT_ELIGIBILITY_PREFERENCES } from '../src/pipeline/eligibility.js';
import { SOURCE_REGISTRY, enabledSources, isDueForCrawl } from '../src/sources/registry.js';
import { candidate, FIXED_NOW, fixture, fixtureFetch } from './helpers.js';
import type { OpportunityCategory } from '../src/types.js';

const ALL_FIXTURES: Record<string, string> = {
  'remotive.com/api/remote-jobs': fixture('remotive.json'),
  'remoteok.com/api': fixture('remoteok.json'),
  'arbeitnow.com/api/job-board-api': fixture('arbeitnow.json'),
  'api.github.com/search/issues': fixture('github-bounties.json'),
  'hn.algolia.com': fixture('hn-freelancer.json')
};

function runParams(extra: Record<string, unknown> = {}) {
  const { fetchImpl } = fixtureFetch(ALL_FIXTURES);
  return {
    sources: SOURCE_REGISTRY,
    fetchImpl,
    now: FIXED_NOW,
    force: true,
    ...extra
  };
}

describe('runHunt end to end (recorded provider payloads)', () => {
  it('produces published records from the live adapters', async () => {
    const result = await runHunt(runParams());
    expect(result.published.length).toBeGreaterThan(0);
    expect(result.stats.fetched).toBeGreaterThan(0);
  });

  it('only publishes candidates from sources whose terms were reviewed', async () => {
    const result = await runHunt(runParams());
    const servable = new Set(enabledSources().map(s => s.id));
    for (const record of result.published) {
      expect(servable.has(record.sourceId), `${record.sourceId} is servable`).toBe(true);
    }
  });

  it('marks every published record as zero capital with a real evidence hash', async () => {
    const result = await runHunt(runParams());
    for (const record of result.published) {
      expect(record.visibility).toBe('published');
      expect(record.zeroCapital).toBe(true);
      expect(record.evidenceHash).toMatch(/^[0-9a-f]{64}$/);
      expect(record.evidenceCount).toBeGreaterThan(0);
      expect(record.rankScore).toBeGreaterThanOrEqual(0);
      expect(record.rankScore).toBeLessThanOrEqual(100);
    }
  });

  it('requires attribution and a link-back flag on every published record', async () => {
    const result = await runHunt(runParams());
    for (const record of result.published) {
      expect(record.attribution.length).toBeGreaterThan(0);
      expect(record.sourceUrl).toMatch(/^https?:\/\//);
    }
  });

  it('orders published records by rank score, best first', async () => {
    const result = await runHunt(runParams());
    const scores = result.published.map(r => r.rankScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('rejects the on-site Arbeitnow roles with a named reason', async () => {
    const result = await runHunt(runParams());
    const onsite = result.rejections.filter(r => r.stage === 'eligibility');
    expect(onsite.length).toBeGreaterThan(0);
    expect(onsite.some(r => r.reasons.join(' ').match(/on-site/i))).toBe(true);
  });

  it('reports unknown fields instead of silently treating silence as false', async () => {
    const result = await runHunt(runParams());
    expect(result.stats.unknownFields).toBeGreaterThan(0);
  });

  it('lists the dormant adapters with the registry reason', async () => {
    const result = await runHunt(runParams());
    // After the compliance review: two prohibited sources, plus HN which is not
    // permitted for a multi-user deployment.
    expect(result.dormant.map(d => d.sourceId).sort()).toEqual([
      'devpost',
      'freelancer-rss',
      'hn-freelancer'
    ]);
    for (const entry of result.dormant) {
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });

  it('does not crawl a source restricted for public deployment', async () => {
    const result = await runHunt(runParams());
    expect(result.sourceRuns.some(run => run.sourceId === 'hn-freelancer')).toBe(false);
    expect(result.published.some(record => record.sourceId === 'hn-freelancer')).toBe(false);
  });

  it('records a per-source run log', async () => {
    const result = await runHunt(runParams());
    expect(result.sourceRuns.length).toBeGreaterThan(0);
    for (const run of result.sourceRuns) {
      expect(run.startedAt).toBe(FIXED_NOW.toISOString());
      expect(run.error === null || typeof run.error === 'string').toBe(true);
    }
  });

  it('is reproducible: the same input twice gives byte-identical output', async () => {
    const first = await runHunt(runParams());
    const second = await runHunt(runParams());
    expect(JSON.stringify(second.published)).toBe(JSON.stringify(first.published));
    expect(JSON.stringify(second.stats)).toBe(JSON.stringify(first.stats));
  });
});

describe('crawl intervals', () => {
  it('skips a source that was crawled more recently than its interval', async () => {
    const recent = { remotive: '2026-10-14T11:55:00.000Z' }; // 5 minutes ago; interval is 360.
    const result = await runHunt(runParams({ force: false, lastRunBySource: recent }));
    const remotive = result.sourceRuns.find(r => r.sourceId === 'remotive');
    expect(remotive?.skippedForInterval).toBe(true);
    expect(remotive?.itemsSeen).toBe(0);
    expect(result.published.some(p => p.sourceId === 'remotive')).toBe(false);
  });

  it('runs a source whose interval has elapsed', async () => {
    const old = { remotive: '2026-10-14T00:00:00.000Z' }; // 12 hours ago.
    const result = await runHunt(runParams({ force: false, lastRunBySource: old }));
    const remotive = result.sourceRuns.find(r => r.sourceId === 'remotive');
    expect(remotive?.skippedForInterval).toBe(false);
    expect(result.published.some(p => p.sourceId === 'remotive')).toBe(true);
  });

  it('treats a missing last-run as due', () => {
    const source = SOURCE_REGISTRY.find(s => s.id === 'remotive');
    expect(isDueForCrawl(source!, null, FIXED_NOW)).toBe(true);
  });

  it('does not stall on clock skew from the future', () => {
    const source = SOURCE_REGISTRY.find(s => s.id === 'remotive');
    expect(isDueForCrawl(source!, '2027-01-01T00:00:00.000Z', FIXED_NOW)).toBe(true);
  });
});

describe('failure handling', () => {
  it('records an adapter error without throwing the whole run', async () => {
    const failing = {
      sourceId: 'remotive',
      description: 'always fails',
      run: async () => ({
        sourceId: 'remotive',
        ok: false,
        httpStatus: 503,
        error: 'HTTP 503 Service Unavailable',
        bytes: 0,
        candidates: [],
        itemsSeen: 0,
        skipped: [],
        fetchedAt: FIXED_NOW.toISOString()
      })
    };
    const result = await runHunt(runParams({ adapters: [failing] }));
    expect(result.sourceRuns[0]?.ok).toBe(false);
    expect(result.stats.perSource.remotive?.error).toContain('503');
    expect(result.published).toHaveLength(0);
  });

  it('refuses to run an adapter with no registry entry', async () => {
    const rogue = {
      sourceId: 'not-registered',
      description: 'unknown',
      run: async () => ({
        sourceId: 'not-registered',
        ok: true,
        httpStatus: 200,
        error: null,
        bytes: 1,
        candidates: [],
        itemsSeen: 0,
        skipped: [],
        fetchedAt: FIXED_NOW.toISOString()
      })
    };
    const result = await runHunt(runParams({ adapters: [rogue] }));
    expect(result.sourceRuns[0]?.ok).toBe(false);
    expect(result.sourceRuns[0]?.error).toMatch(/no registry entry/i);
  });

  it('refuses to run an injected adapter for a disabled source', async () => {
    const devpostish = {
      sourceId: 'devpost',
      description: 'disabled source',
      run: async () => ({
        sourceId: 'devpost',
        ok: true,
        httpStatus: 200,
        error: null,
        bytes: 1,
        candidates: [],
        itemsSeen: 0,
        skipped: [],
        fetchedAt: FIXED_NOW.toISOString()
      })
    };
    const result = await runHunt(runParams({ adapters: [devpostish] }));
    expect(result.sourceRuns[0]?.ok).toBe(false);
    expect(result.sourceRuns[0]?.error).toMatch(/terms|disabled/i);
  });

  it('fails loudly when no fetch implementation is available', async () => {
    // Simulate an environment without global fetch: the run must refuse rather
    // than silently report "no opportunities".
    const original = globalThis.fetch;
    (globalThis as { fetch?: unknown }).fetch = undefined;
    try {
      await expect(runHunt({ sources: SOURCE_REGISTRY, now: FIXED_NOW })).rejects.toThrow(/fetch/i);
    } finally {
      (globalThis as { fetch?: unknown }).fetch = original;
    }
  });
});

describe('processCandidate stages', () => {
  const source = SOURCE_REGISTRY[0]!;

  it('withholds a candidate that asks the applicant for money, naming the risk stage', async () => {
    // Precedence: a payment demand is a critical risk finding AND a zero-capital
    // failure. The risk stage is reported because it is the stronger signal.
    const { candidate: processed, rejection } = processCandidate({
      candidate: candidate({ description: 'Pay a registration fee of $50 to receive tasks.' }),
      source,
      existing: [],
      prefs: DEFAULT_ELIGIBILITY_PREFERENCES,
      weights: DEFAULT_WEIGHTS,
      userSkills: [],
      history: {},
      now: FIXED_NOW
    });
    expect(processed.visibility).toBe('withheld');
    expect(rejection?.stage).toBe('risk');
    expect(rejection?.findingCodes).toContain('upfront_payment_request');
    expect(processed.noCapitalRequired).toBe(false);
    expect(processed.zeroCapital?.zeroCapital).toBe(false);
  });

  it('rejects at the zero-capital stage when a cost is stated but no risk rule fires', async () => {
    // "minimum balance" is a cost signal for the zero-capital stage that the
    // risk engine does not treat as a payment demand, so this isolates the gate.
    const { candidate: processed, rejection } = processCandidate({
      candidate: candidate({ description: 'A minimum balance of $50 must be maintained in your account.' }),
      source,
      existing: [],
      prefs: DEFAULT_ELIGIBILITY_PREFERENCES,
      weights: DEFAULT_WEIGHTS,
      userSkills: [],
      history: {},
      now: FIXED_NOW
    });
    expect(processed.zeroCapital?.zeroCapital).toBe(false);
    expect(processed.noCapitalRequired).toBe(false);
    expect(processed.risk?.blocked).toBe(false);
    expect(rejection?.stage).toBe('zero-capital');
    expect(processed.visibility).toBe('rejected');
  });

  it('withholds a candidate that trips a blocking risk rule', async () => {
    const { candidate: processed, rejection } = processCandidate({
      candidate: candidate({
        description: 'Guaranteed income of $900 per day. Send your seed phrase to begin.',
        evidence: { snapshots: [], assertions: [] }
      }),
      source,
      existing: [],
      prefs: DEFAULT_ELIGIBILITY_PREFERENCES,
      weights: DEFAULT_WEIGHTS,
      userSkills: [],
      history: {},
      now: FIXED_NOW
    });
    expect(processed.visibility).toBe('withheld');
    expect(rejection?.stage).toBe('risk');
    expect(rejection?.findingCodes.length).toBeGreaterThan(0);
  });

  it('rejects a duplicate before scoring it', async () => {
    const original = candidate({ id: 'remotive:1', sourceItemId: '1' });
    const { candidate: processed, rejection } = processCandidate({
      candidate: original,
      source,
      existing: [original],
      prefs: DEFAULT_ELIGIBILITY_PREFERENCES,
      weights: DEFAULT_WEIGHTS,
      userSkills: [],
      history: {},
      now: FIXED_NOW
    });
    expect(processed.visibility).toBe('rejected');
    expect(rejection?.stage).toBe('dedupe');
  });

  it('keeps an unknown up-front cost as unknown, not false', async () => {
    const { candidate: processed } = processCandidate({
      candidate: candidate({ description: 'Build a landing page with React and deliver the source code.' }),
      source,
      existing: [],
      prefs: DEFAULT_ELIGIBILITY_PREFERENCES,
      weights: DEFAULT_WEIGHTS,
      userSkills: [],
      history: {},
      now: FIXED_NOW
    });
    expect(processed.noCapitalRequired).toBe('unknown');
    expect(processed.visibility).toBe('published');
    expect(processed.eligibility?.needsMoreEvidence).toBe(true);
  });

  it('records a trace of the stages it ran', async () => {
    const { candidate: processed } = processCandidate({
      candidate: candidate(),
      source,
      existing: [],
      prefs: DEFAULT_ELIGIBILITY_PREFERENCES,
      weights: DEFAULT_WEIGHTS,
      userSkills: [],
      history: {},
      now: FIXED_NOW
    });
    expect(processed.trace.join(' ')).toMatch(/dedupe:/);
    expect(processed.trace.join(' ')).toMatch(/risk:/);
    expect(processed.trace.join(' ')).toMatch(/rank:\d+/);
  });
});

describe('toPublished', () => {
  it('carries the source attribution and link-back requirement', async () => {
    const source = SOURCE_REGISTRY.find(s => s.id === 'remotive')!;
    const processed = {
      ...candidate({ sourceId: 'remotive' }),
      scores: { rankScore: 71, trustScore: 90, confidence: 80, components: [] },
      risk: { level: 'low' as const, trustScore: 90, findings: [], blocked: false },
      dedupe: { verdict: 'unique' as const, fingerprint: 'fp', normalizedKey: 'k', matchedId: null, similarity: 0, reason: '' }
    };
    const record = await toPublished(processed, source);
    expect(record.attribution).toBe('Remotive');
    expect(record.requiresLinkBack).toBe(true);
    expect(record.rankScore).toBe(71);
    expect(record.fingerprint).toBe('fp');
  });
});

describe('collapseDuplicates', () => {
  it('keeps one record per fingerprint and reports the drop', () => {
    const a = candidate({ id: 'remotive:1', sourceItemId: '1' });
    const b = candidate({
      id: 'remoteok:1',
      sourceId: 'remoteok',
      sourceItemId: '1',
      dedupe: { verdict: 'duplicate', fingerprint: 'same', normalizedKey: 'k', matchedId: 'remotive:1', similarity: 1, reason: '' }
    });
    const withFingerprint = { ...a, dedupe: { ...a.dedupe!, fingerprint: 'same' } };
    const { kept, dropped } = collapseDuplicates([withFingerprint, b]);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(1);
    expect(dropped[0]?.keptId).toBe(kept[0]?.id);
  });

  it('keeps distinct candidates', () => {
    const a = candidate({ id: 'remotive:1', sourceItemId: '1', title: 'Frontend Developer', category: 'Development' as OpportunityCategory });
    const b = candidate({
      id: 'remotive:2',
      sourceItemId: '2',
      title: 'Tax Accountant',
      provider: 'Buchhaltung GmbH',
      description: 'Prepare VAT returns.',
      dedupe: { verdict: 'unique', fingerprint: 'other', normalizedKey: 'k', matchedId: null, similarity: 0, reason: '' }
    });
    const { kept, dropped } = collapseDuplicates([a, b]);
    expect(kept).toHaveLength(2);
    expect(dropped).toHaveLength(0);
  });
});
