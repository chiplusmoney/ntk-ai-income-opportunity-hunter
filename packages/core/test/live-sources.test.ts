import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// @ts-expect-error Node-only verification helper, not a frontend/runtime dependency.
import { createProbeCache } from '../../../tools/source-probe-cache.mjs';
import {
  ADAPTERS,
  SOURCE_REGISTRY,
  assertProbeAllowed,
  describePlan,
  hostOf,
  isServable,
  planLiveProbes,
  type DeploymentScope,
  type SourceDefinition
} from '../src/index.js';
import { DEFAULT_USER_AGENT } from '../src/sources/http.js';
import { parseNumericToken, parseRewardText } from '../src/reward.js';
import { fixture } from './helpers.js';

/**
 * LIVE provider verification — compliance aware.
 *
 * Skipped by default; run it with `npm run verify:live`.
 *
 * ## The rule this suite enforces
 *
 * A real outbound request is made ONLY to a source whose terms permit reading it
 * for this deployment's audience. `planLiveProbes()` derives that set from the
 * registry, so the list cannot drift away from the compliance record:
 *
 *  - sources whose terms PROHIBIT automated access (Devpost, Freelancer) are
 *    never contacted — their adapters are verified from recorded fixtures in the
 *    same run, which still proves they parse the real payload shape;
 *  - a source restricted to personal scope (Hacker News) is contacted only when
 *    `LIVE_SCOPE=personal` explicitly says the deployment is single-user;
 *  - `assertProbeAllowed` wraps `fetch`, so any attempt to contact a host the
 *    plan does not permit throws instead of quietly violating someone's terms.
 *
 * Set `LIVE_SCOPE=personal` to include personal-scope sources. The default is
 * `public`, the stricter reading.
 */
const live = process.env.LIVE_SOURCES === '1';
const scope: DeploymentScope = process.env.LIVE_SCOPE === 'personal' ? 'personal' : 'public';
const plan = planLiveProbes({ sources: SOURCE_REGISTRY, scope });
const TIMEOUT = 60_000;

for (const line of describePlan(plan)) console.log(`[live-probe] ${line}`);

/** fetch, with the compliance guard applied to every URL it is asked for. */
// Reuse one permitted response per URL within this suite. Tests do not multiply polling passes.
let productionRuns:unknown[]=[];
try { productionRuns=JSON.parse(readFileSync(new URL('../../../docs/verification/m7-production-yield.json',import.meta.url),'utf8')).sources??[]; } catch { /* no production receipt yet */ }
const cachedProbe=createProbeCache({directory:fileURLToPath(new URL('../../../.cache/live-probes/',import.meta.url)),sources:plan.probe,productionRuns,log:(line:string)=>console.log(`[live-probe] ${line}`)});
const guardedFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  assertProbeAllowed(url, plan);
  return cachedProbe(url,init);
};

const ctx = {
  fetchImpl: guardedFetch,
  now: () => new Date(),
  userAgent: DEFAULT_USER_AGENT,
  timeoutMs: 45_000
};

describe.skipIf(!live)('live source verification (permitted sources only)', () => {
  it('plans only permitted sources for the live run', () => {
    // Sanity check on the plan itself, before any request is made.
    expect(plan.probe.length).toBeGreaterThan(0);
    for (const source of plan.probe) {
      expect(isServable(source, scope), `${source.id} servable in ${scope} scope`).toBe(true);
    }
    // The prohibited sources can never appear in a probe list, in any scope.
    expect(plan.probe.map(s => s.id)).not.toContain('devpost');
    expect(plan.probe.map(s => s.id)).not.toContain('freelancer-rss');
    expect(plan.forbiddenHosts).toContain('devpost.com');
    expect(plan.forbiddenHosts).toContain('www.freelancer.com');
  });

  it('refuses to contact a prohibited host', () => {
    // The guard must be real, not decorative.
    expect(() => assertProbeAllowed('https://devpost.com/api/hackathons', plan)).toThrow(/Refusing to contact/i);
    expect(() => assertProbeAllowed('https://www.freelancer.com/rss.xml', plan)).toThrow(/Refusing to contact/i);
    // And an unlisted host fails closed.
    expect(() => assertProbeAllowed('https://example.com/anything', plan)).toThrow(/Refusing to contact/i);
  });

  it('probes every permitted endpoint and reports the real status', async () => {
    const rows: string[] = [];
    for (const source of plan.probe) {
      const response = await guardedFetch(source.endpoint, { headers: { 'user-agent': DEFAULT_USER_AGENT } });
      rows.push(`${source.id}: HTTP ${response.status}`);
      expect(response.status, `${source.id} (${source.endpoint})`).toBe(200);
    }
    console.log(rows.join('\n'));
  }, TIMEOUT);

  it('runs every permitted adapter against the live provider', async () => {
    const report: string[] = [];
    for (const adapter of ADAPTERS) {
      const source = plan.probe.find(candidate => candidate.id === adapter.sourceId);
      // Adapters outside the plan are deliberately not run here.
      if (!source) continue;

      const result = await adapter.run(ctx);
      report.push(
        `${adapter.sourceId}: ok=${result.ok} status=${result.httpStatus} bytes=${result.bytes} seen=${result.itemsSeen} candidates=${result.candidates.length}`
      );

      expect(result.ok, `${adapter.sourceId} run`).toBe(true);
      expect(result.httpStatus).toBe(200);
      expect(result.candidates.length, `${adapter.sourceId} candidates`).toBeGreaterThan(0);

      for (const candidate of result.candidates) {
        expect(candidate.evidence.snapshots.length).toBeGreaterThan(0);
        expect(candidate.evidence.snapshots[0]?.contentHash).toMatch(/^[0-9a-f]{64}$/);
        expect(candidate.sourceUrl).toMatch(/^https?:\/\//);
        expect(candidate.id).toBe(`${candidate.sourceId}:${candidate.sourceItemId}`);
        // Every fetched URL in this run went through the guard.
        expect(hostOf(candidate.evidence.snapshots[0]?.sourceUrl ?? '')).not.toBe('');
      }
    }
    console.log(report.join('\n'));
    expect(report.length).toBe(plan.probe.length);
  }, TIMEOUT * 2);

  it('verifies forbidden and out-of-scope adapters from their recorded fixtures instead', async () => {
    // No network here: the fixtures are the recorded real payloads, so the
    // adapters stay proven even though the providers must not be contacted.
    const fixtureFor: Record<string, string> = {
      devpost: 'devpost.json',
      'freelancer-rss': 'freelancer-rss.xml',
      'hn-freelancer': 'hn-freelancer.json'
    };

    const report: string[] = [];
    for (const { source, reason } of plan.offlineOnly) {
      const fixtureName = fixtureFor[source.id];
      expect(fixtureName, `a recorded fixture exists for ${source.id}`).toBeDefined();
      expect(reason.length, `${source.id} has a stated reason`).toBeGreaterThan(10);

      const adapter = ADAPTERS.find(candidate => candidate.sourceId === source.id);
      expect(adapter, `adapter for ${source.id}`).toBeDefined();

      const offlineFetch = (async () =>
        new Response(fixture(fixtureName as string), {
          status: 200,
          headers: { 'content-type': fixtureName?.endsWith('.xml') ? 'text/xml' : 'application/json' }
        })) as unknown as typeof fetch;

      const result = await adapter!.run({ ...ctx, fetchImpl: offlineFetch });
      expect(result.ok, `${source.id} fixture run`).toBe(true);
      expect(result.candidates.length, `${source.id} fixture candidates`).toBeGreaterThan(0);

      report.push(`${source.id}: verified offline from ${fixtureName} — ${reason}`);
    }
    console.log(report.join('\n'));
    expect(report.length).toBe(plan.offlineOnly.length);
  }, TIMEOUT);

  it('still reads a live salary string with the same parser the adapters use', async () => {
    const remotive = plan.probe.find(source => source.id === 'remotive');
    if (!remotive) return;

    const response = await guardedFetch(remotive.endpoint, { headers: { 'user-agent': DEFAULT_USER_AGENT } });
    const payload = (await response.json()) as { jobs?: { salary?: string }[] };
    const salaries = (payload.jobs ?? []).map(job => job.salary ?? '');
    const withText = salaries.filter(salary => salary.trim().length > 0);

    expect(withText.length).toBeGreaterThan(0);
    const readable = withText.filter(salary => parseRewardText(salary).min !== null);
    expect(readable.length).toBeGreaterThan(0);
    for (const salary of withText) {
      expect(parseRewardText(salary).raw).toBe(salary.trim());
    }

    console.log(`remotive salaries: ${withText.length} non-empty, ${readable.length} machine-readable`);
    expect(parseNumericToken('35,3k')).toBe(35300);
  }, TIMEOUT);

  it('confirms the terms notices the registry relies on are still published', async () => {
    const noticeChecks: { sourceId: string; pattern: RegExp; label: string }[] = [
      { sourceId: 'remotive', pattern: /link back/i, label: 'Remotive link-back notice' },
      { sourceId: 'remoteok', pattern: /link back/i, label: 'Remote OK link-back notice' },
      { sourceId: 'arbeitnow', pattern: /free public API/i, label: 'Arbeitnow terms text' }
    ];

    for (const check of noticeChecks) {
      const source = plan.probe.find(candidate => candidate.id === check.sourceId);
      if (!source) continue;

      const response = await guardedFetch(source.endpoint, { headers: { 'user-agent': DEFAULT_USER_AGENT } });
      const body = await response.text();
      expect(body, check.label).toMatch(check.pattern);
    }
  }, TIMEOUT);

  it('probes no source that the registry does not permit for this scope', () => {
    const permittedIds = new Set(
      SOURCE_REGISTRY.filter((source: SourceDefinition) => isServable(source, scope)).map(source => source.id)
    );
    for (const source of plan.probe) {
      expect(permittedIds.has(source.id), `${source.id} is permitted in ${scope} scope`).toBe(true);
    }
    // In public scope the personal-only source is excluded by construction.
    if (scope === 'public') {
      expect(plan.probe.map(s => s.id)).not.toContain('hn-freelancer');
      expect(plan.forbiddenHosts).toContain('hn.algolia.com');
    } else {
      expect(plan.probe.map(s => s.id)).toContain('hn-freelancer');
    }
  });
});
