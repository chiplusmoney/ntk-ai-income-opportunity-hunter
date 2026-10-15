/**
 * Live source verification — compliance aware.
 *
 * Runs the gated `live-sources.test.ts` suite, which probes ONLY the sources whose
 * terms permit reading them for this deployment's audience. The permitted set is
 * derived from the registry (`planLiveProbes`), so it cannot drift from the
 * compliance record, and a wrapped `fetch` refuses any host the plan does not
 * allow.
 *
 * What that means in practice:
 *  - Remotive, Remote OK, Arbeitnow and GitHub bounties are probed when their
 *    terms and scope permit it;
 *  - Devpost and Freelancer.com are PROHIBITED and are therefore NEVER contacted
 *    automatically — their adapters are verified from recorded fixtures in the
 *    same run;
 *  - Hacker News is personal-scope only, so it is skipped unless you explicitly
 *    run with LIVE_SCOPE=personal;
 *  - the terms notices the registry relies on are re-checked on the sources that
 *    are contacted, so a silent change of terms fails the suite.
 *
 * Usage (from WORKING/):
 *   npm run verify:live                        # public scope (default, stricter)
 *   $env:LIVE_SCOPE='personal'; npm run verify:live
 *
 * Exits non-zero when a permitted provider changed shape or terms, so this
 * belongs in the pre-handoff checklist whenever a source is touched.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workingDir = join(here, '..');
const coreDir = join(workingDir, 'packages', 'core');

const scope = process.env.LIVE_SCOPE === 'personal' ? 'personal' : 'public';

console.log(`Live source verification — deployment scope: ${scope}`);
console.log('Only sources whose terms permit reading them for this scope will be contacted.');
console.log('Prohibited sources (Devpost, Freelancer.com) are never contacted; their adapters are verified from recorded fixtures.');
if (scope === 'public') {
  console.log('Hacker News is personal-scope only, so it is skipped. Set LIVE_SCOPE=personal to include it.');
}

const vitest = join(workingDir, 'node_modules', 'vitest', 'vitest.mjs');
if (!existsSync(vitest)) {
  console.error(`Could not find vitest at ${vitest}. Run npm install first.`);
  process.exit(3);
}

const child = spawnSync(process.execPath, [vitest, 'run', 'test/live-sources.test.ts'], {
  cwd: coreDir,
  stdio: 'inherit',
  env: { ...process.env, LIVE_SOURCES: '1', LIVE_SCOPE: scope }
});

if ((child.status ?? 1) === 0) {
  console.log('\nLive source verification PASSED.');
} else {
  console.error(`\nLive source verification FAILED (exit ${child.status}). Re-probe the registry before trusting it.`);
  process.exitCode = child.status ?? 1;
}
