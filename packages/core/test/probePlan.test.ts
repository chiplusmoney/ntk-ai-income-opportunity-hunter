import { describe, expect, it } from 'vitest';
import {
  ProbeNotAllowedError,
  assertProbeAllowed,
  describePlan,
  hostOf,
  isProbeAllowed,
  planLiveProbes
} from '../src/sources/probePlan.js';
import { SOURCE_REGISTRY } from '../src/sources/registry.js';

/**
 * The compliance policy that governs which sources a live run may contact.
 *
 * This is tested WITHOUT network access on purpose: the rule "never contact a
 * prohibited source" must hold in CI, not only when someone remembers to run the
 * live suite.
 */
describe('live probe plan — public scope (the default)', () => {
  const plan = planLiveProbes({ sources: SOURCE_REGISTRY });

  it('defaults to the stricter public scope', () => {
    expect(plan.scope).toBe('public');
  });

  it('probes only the sources whose terms permit multi-user reading', () => {
    expect(plan.probe.map(source => source.id)).toEqual([
      'arbeitnow',
      'github-bounties',
      'jobicy',
      'remoteok',
      'remotive',
      'weworkremotely'
    ]);
  });

  it('never probes a source whose terms prohibit automated access', () => {
    const ids = plan.probe.map(source => source.id);
    expect(ids).not.toContain('devpost');
    expect(ids).not.toContain('freelancer-rss');
    expect(plan.forbiddenHosts).toContain('devpost.com');
    expect(plan.forbiddenHosts).toContain('www.freelancer.com');
  });

  it('excludes the personal-scope source from a public deployment', () => {
    expect(plan.probe.map(source => source.id)).not.toContain('hn-freelancer');
    expect(plan.forbiddenHosts).toContain('hn.algolia.com');
  });

  it('forbids the homepage host as well as the API host', () => {
    // Fetching news.ycombinator.com HTML is the "scrape the Site" conduct the
    // terms forbid, not merely an API call, so the homepage is off limits too.
    expect(plan.forbiddenHosts).toContain('news.ycombinator.com');
  });

  it('explains every exclusion with the registry reason', () => {
    expect(plan.offlineOnly.length).toBeGreaterThan(0);
    for (const { source, reason } of plan.offlineOnly) {
      expect(reason.length, source.id).toBeGreaterThan(10);
    }
    const devpost = plan.offlineOnly.find(entry => entry.source.id === 'devpost');
    expect(devpost?.reason).toMatch(/prohibit/i);
  });

  it('allows exactly the hosts of the probed sources', () => {
    expect(plan.allowedHosts).toEqual([
      'api.github.com',
      'jobicy.com',
      // 'remoteok.com' sorts before 'remotive.com' ('e' < 'i' at the sixth
      // character), which is why this list is not in registry order.
      'remoteok.com',
      'remotive.com',
      'weworkremotely.com',
      'www.arbeitnow.com'
    ]);
  });
});

describe('live probe plan — personal scope', () => {
  const plan = planLiveProbes({ sources: SOURCE_REGISTRY, scope: 'personal' });

  it('includes the personal-scope source', () => {
    expect(plan.probe.map(source => source.id)).toContain('hn-freelancer');
    expect(plan.allowedHosts).toContain('hn.algolia.com');
  });

  it('still refuses the prohibited sources', () => {
    // A narrower audience does not make a prohibited read permitted.
    expect(plan.probe.map(source => source.id)).not.toContain('devpost');
    expect(plan.probe.map(source => source.id)).not.toContain('freelancer-rss');
  });
});

describe('probe guard', () => {
  const plan = planLiveProbes({ sources: SOURCE_REGISTRY });

  it('allows a permitted host', () => {
    expect(isProbeAllowed('https://remotive.com/api/remote-jobs', plan)).toBe(true);
    expect(() => assertProbeAllowed('https://remotive.com/api/remote-jobs', plan)).not.toThrow();
  });

  it('refuses a prohibited host', () => {
    expect(isProbeAllowed('https://devpost.com/api/hackathons', plan)).toBe(false);
    expect(() => assertProbeAllowed('https://devpost.com/api/hackathons', plan)).toThrow(ProbeNotAllowedError);
  });

  it('refuses a host that is not in the plan at all (fails closed)', () => {
    expect(() => assertProbeAllowed('https://example.com/x', plan)).toThrow(/Refusing to contact/i);
  });

  it('refuses an unparseable URL', () => {
    expect(() => assertProbeAllowed('not-a-url', plan)).toThrow(/Refusing to contact/i);
  });

  it('names the scope and the forbidden hosts in the error', () => {
    try {
      assertProbeAllowed('https://www.freelancer.com/rss.xml', plan);
      throw new Error('guard did not throw');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/scope \(public\)/);
      expect(message).toContain('www.freelancer.com');
      expect(message).toMatch(/recorded fixtures/i);
    }
  });
});

describe('plan reporting', () => {
  it('describes what will be probed and what will not', () => {
    const lines = describePlan(planLiveProbes({ sources: SOURCE_REGISTRY }));
    expect(lines[0]).toBe('scope: public');
    expect(lines.some(line => line.includes('PROBE') && line.includes('remotive'))).toBe(true);
    expect(lines.some(line => line.includes('OFFLINE') && line.includes('devpost'))).toBe(true);
    expect(lines.some(line => line.includes('never contacted'))).toBe(true);
  });

  it('is deterministic', () => {
    const a = planLiveProbes({ sources: SOURCE_REGISTRY });
    const b = planLiveProbes({ sources: SOURCE_REGISTRY });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('hostOf', () => {
  it('extracts a lowercased hostname', () => {
    expect(hostOf('https://RemoteOK.com/api')).toBe('remoteok.com');
    expect(hostOf('https://www.arbeitnow.com/api/job-board-api')).toBe('www.arbeitnow.com');
  });

  it('returns an empty string for a URL it cannot parse', () => {
    expect(hostOf('')).toBe('');
    expect(hostOf('nonsense')).toBe('');
  });
});
