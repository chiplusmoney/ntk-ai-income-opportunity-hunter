import { describe, expect, it } from 'vitest';
import { backoffDelayMs, planCrawl, shouldRetry, summarizeSourceRuns } from '../src/sources/schedule.js';
import { SOURCE_REGISTRY, isServable, sourceScopeProblem } from '../src/sources/registry.js';
import { FIXED_NOW } from './helpers.js';
import type { SourceDefinition, SourceRunRecord } from '../src/types.js';

const NOW = FIXED_NOW;
const iso = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();

describe('planCrawl', () => {
  it('marks a never-crawled source as due', () => {
    const plan = planCrawl({ sources: SOURCE_REGISTRY, lastRunBySource: {}, now: NOW });
    expect(plan.due.length).toBeGreaterThan(0);
    const entry = plan.entries.find(e => e.sourceId === 'remotive');
    expect(entry?.due).toBe(true);
    expect(entry?.reason).toMatch(/never crawled/i);
  });

  it('respects the Remotive request budget instead of the heartbeat', () => {
    // The Cloudflare cron fires every 30 minutes. Remotive asked for ~4/day.
    const plan = planCrawl({
      sources: SOURCE_REGISTRY,
      lastRunBySource: { remotive: iso(30) },
      now: NOW
    });
    const remotive = plan.entries.find(e => e.sourceId === 'remotive');
    expect(remotive?.due).toBe(false);
    expect(remotive?.nextDueAt).toBeTruthy();
    expect(plan.due.some(s => s.id === 'remotive')).toBe(false);
  });

  it('marks a source due once its own interval has elapsed', () => {
    const plan = planCrawl({
      sources: SOURCE_REGISTRY,
      lastRunBySource: { remotive: iso(400) },
      now: NOW
    });
    expect(plan.due.some(s => s.id === 'remotive')).toBe(true);
  });

  it('never schedules a dormant source', () => {
    const plan = planCrawl({ sources: SOURCE_REGISTRY, lastRunBySource: {}, now: NOW, force: true });
    expect(plan.due.some(s => s.id === 'devpost')).toBe(false);
    expect(plan.due.some(s => s.id === 'freelancer-rss')).toBe(false);
    const dormant = plan.entries.find(e => e.sourceId === 'freelancer-rss');
    expect(dormant?.reason).toMatch(/prohibits|express written permission/i);
  });

  it('force overrides intervals for the servable sources only', () => {
    const plan = planCrawl({
      sources: SOURCE_REGISTRY,
      lastRunBySource: { remotive: iso(1) },
      now: NOW,
      force: true
    });
    expect(plan.due.some(s => s.id === 'remotive')).toBe(true);
    expect(plan.due.some(s => s.id === 'devpost')).toBe(false);
  });

  it('orders the stalest sources first', () => {
    const plan = planCrawl({
      sources: SOURCE_REGISTRY,
      lastRunBySource: { remoteok: iso(90), arbeitnow: iso(600) },
      now: NOW,
      force: true
    });
    const ids = plan.due.map(s => s.id);
    // arbeitnow has waited longest, so it must come before remoteok.
    expect(ids.indexOf('arbeitnow')).toBeLessThan(ids.indexOf('remoteok'));
  });

  it('caps a single run and defers the rest', () => {
    const plan = planCrawl({
      sources: SOURCE_REGISTRY,
      lastRunBySource: {},
      now: NOW,
      maxSourcesPerRun: 2
    });
    expect(plan.due).toHaveLength(2);
    expect(plan.deferred.length).toBeGreaterThan(0);
  });

  it('batches the due sources', () => {
    const plan = planCrawl({
      sources: SOURCE_REGISTRY,
      lastRunBySource: {},
      now: NOW,
      batchSize: 2,
      maxSourcesPerRun: 5
    });
    expect(plan.batches.length).toBeGreaterThan(1);
    for (const batch of plan.batches) {
      expect(batch.length).toBeLessThanOrEqual(2);
    }
    expect(plan.batches.flat()).toEqual(plan.due.map(s => s.id));
  });

  it('can be restricted to specific sources', () => {
    const plan = planCrawl({
      sources: SOURCE_REGISTRY,
      lastRunBySource: {},
      now: NOW,
      only: ['remotive'],
      force: true
    });
    expect(plan.due.map(s => s.id)).toEqual(['remotive']);
  });

  it('is deterministic', () => {
    const params = { sources: SOURCE_REGISTRY, lastRunBySource: { remoteok: iso(90) }, now: NOW };
    expect(JSON.stringify(planCrawl(params))).toBe(JSON.stringify(planCrawl(params)));
  });

  it('treats a future timestamp as due rather than stalling', () => {
    const plan = planCrawl({
      sources: SOURCE_REGISTRY,
      lastRunBySource: { remotive: new Date(NOW.getTime() + 3_600_000).toISOString() },
      now: NOW
    });
    expect(plan.due.some(s => s.id === 'remotive')).toBe(true);
  });

  it('explains every decision it makes', () => {
    const plan = planCrawl({ sources: SOURCE_REGISTRY, lastRunBySource: { remotive: iso(30) }, now: NOW });
    expect(plan.entries.length).toBe(SOURCE_REGISTRY.length);
    for (const entry of plan.entries) {
      expect(entry.reason.length).toBeGreaterThan(10);
    }
  });
});

describe('retry policy', () => {
  it('backs off exponentially and caps', () => {
    expect(backoffDelayMs(1, 1000, 30_000)).toBe(1000);
    expect(backoffDelayMs(2, 1000, 30_000)).toBe(2000);
    expect(backoffDelayMs(3, 1000, 30_000)).toBe(4000);
    expect(backoffDelayMs(20, 1000, 30_000)).toBe(30_000);
  });

  it('handles nonsense attempts without producing NaN', () => {
    expect(backoffDelayMs(0, 1000, 30_000)).toBe(1000);
    expect(backoffDelayMs(Number.NaN, 1000, 30_000)).toBe(1000);
  });

  it('stops after the attempt ceiling', () => {
    expect(shouldRetry(1, 3)).toBe(true);
    expect(shouldRetry(2, 3)).toBe(true);
    expect(shouldRetry(3, 3)).toBe(false);
  });
});

describe('summarizeSourceRuns', () => {
  const run = (overrides: Partial<SourceRunRecord>): SourceRunRecord => ({
    sourceId: 'remotive',
    startedAt: '2026-10-14T10:00:00.000Z',
    finishedAt: '2026-10-14T10:00:05.000Z',
    ok: true,
    httpStatus: 200,
    bytes: 100,
    itemsSeen: 5,
    accepted: 3,
    rejected: 2,
    error: null,
    skippedForInterval: false,
    ...overrides
  });

  it('keeps the most recent run per source', () => {
    const summary = summarizeSourceRuns([
      run({ startedAt: '2026-10-14T08:00:00.000Z', itemsSeen: 1 }),
      run({ startedAt: '2026-10-14T12:00:00.000Z', itemsSeen: 9 })
    ]);
    expect(summary).toHaveLength(1);
    expect(summary[0]?.itemsSeen).toBe(9);
  });

  it('separates sources and sorts them', () => {
    const summary = summarizeSourceRuns([run({ sourceId: 'remoteok' }), run({ sourceId: 'arbeitnow' })]);
    expect(summary.map(s => s.sourceId)).toEqual(['arbeitnow', 'remoteok']);
  });

  it('exposes nothing beyond run facts', () => {
    const summary = summarizeSourceRuns([run({ error: 'HTTP 503 Service Unavailable' })]);
    const keys = Object.keys(summary[0] ?? {});
    expect(keys.sort()).toEqual(
      [
        'accepted',
        'error',
        'itemsSeen',
        'lastFinishedAt',
        'lastStartedAt',
        'ok',
        'rejected',
        'skippedForInterval',
        'sourceId'
      ].sort()
    );
    // No headers, no URLs, no credentials can leak through this shape.
    expect(JSON.stringify(summary)).not.toMatch(/secret|authorization|bearer|api[-_]?key/i);
  });

  it('returns an empty list when nothing ran', () => {
    expect(summarizeSourceRuns([])).toEqual([]);
  });
});

describe('registry integrity after the compliance review', () => {
  const servablePublic = (s: SourceDefinition) => isServable(s, 'public');
  const servablePersonal = (s: SourceDefinition) => isServable(s, 'personal');

  it('serves only sources whose terms cover a MULTI-USER deployment by default', () => {
    expect(SOURCE_REGISTRY.filter(servablePublic).map(s => s.id).sort()).toEqual([
      'arbeitnow',
      'github-bounties',
      'jobicy',
      'remoteok',
      'remotive',
      'weworkremotely'
    ]);
  });

  it('keeps HN dormant for public deployments but available for personal use', () => {
    const hn = SOURCE_REGISTRY.find(s => s.id === 'hn-freelancer')!;
    expect(servablePublic(hn)).toBe(false);
    expect(servablePersonal(hn)).toBe(true);
    // The restriction must name what would lift it, or "off" is a dead end.
    expect(hn.publicDeploymentGate).toBeTruthy();
    expect(hn.publicDeploymentGate).toMatch(/express written authorisation/i);
  });

  it('names a re-enable condition for every source restricted in public scope', () => {
    for (const source of SOURCE_REGISTRY.filter(s => !servablePublic(s))) {
      const reason = sourceScopeProblem(source, 'public');
      expect(reason, source.id).toBeTruthy();
      if (!source.enabled) continue;
      expect(source.publicDeploymentGate, source.id).toBeTruthy();
    }
  });

  it('keeps the prohibited sources off in both scopes', () => {
    for (const id of ['devpost', 'freelancer-rss']) {
      const source = SOURCE_REGISTRY.find(s => s.id === id)!;
      expect(servablePublic(source), id).toBe(false);
      expect(servablePersonal(source), id).toBe(false);
      expect(source.disabledReason, id).toBeTruthy();
    }
  });

  it('quotes the prohibiting clause in permittedUse rather than saying "unclear"', () => {
    const devpost = SOURCE_REGISTRY.find(s => s.id === 'devpost')!;
    const freelancer = SOURCE_REGISTRY.find(s => s.id === 'freelancer-rss')!;
    expect(devpost.permittedUse).toMatch(/scrape|crawl|spider/i);
    expect(freelancer.permittedUse).toMatch(/express written permission/i);
    // The hash-storing model is explicitly barred by Freelancer's API terms.
    expect(freelancer.permittedUse).toMatch(/hashed/i);
  });

  it('records a stated rate budget for every enabled source', () => {
    for (const source of SOURCE_REGISTRY.filter(s => s.enabled)) {
      expect(source.minIntervalMinutes, source.id).toBeGreaterThanOrEqual(30);
    }
  });

  it('defaults to the stricter public scope when a caller does not say', () => {
    const plan = planCrawl({ sources: SOURCE_REGISTRY, lastRunBySource: {}, now: NOW, force: true });
    expect(plan.due.some(s => s.id === 'hn-freelancer')).toBe(false);
  });

  it('explains a scope restriction in the plan reason', () => {
    const plan = planCrawl({ sources: SOURCE_REGISTRY, lastRunBySource: {}, now: NOW });
    const hn = plan.entries.find(entry => entry.sourceId === 'hn-freelancer');
    expect(hn?.due).toBe(false);
    expect(hn?.reason).toMatch(/authorisation/i);
  });

  it('includes every servable source when the scope is narrowed to personal', () => {
    const plan = planCrawl({
      sources: SOURCE_REGISTRY,
      lastRunBySource: {},
      now: NOW,
      force: true,
      scope: 'personal',
      maxSourcesPerRun: 7
    });
    expect(plan.due.map(s => s.id).sort()).toEqual([
      'arbeitnow',
      'github-bounties',
      'hn-freelancer',
      'jobicy',
      'remoteok',
      'remotive',
      'weworkremotely'
    ]);
    // The two prohibited sources stay out even for a single person.
    expect(plan.due.some(s => s.id === 'freelancer-rss')).toBe(false);
  });
});
