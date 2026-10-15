/**
 * Capture trimmed, real fixtures for the adapter tests.
 *
 * Why this exists: adapter tests that run against hand-written mock JSON only
 * prove the mock matches the code. These fixtures are cut down from live
 * responses, so the tests fail when a provider changes its real shape.
 *
 * Usage (from WORKING/):
 *   node tools/capture-fixtures.mjs
 *
 * The output is trimmed (a couple of items per source, descriptions shortened)
 * so the repository stays small. Every fixture records the fields the adapter
 * reads; nothing is invented. `test/fixtures/README.md` documents provenance.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'packages', 'core', 'test', 'fixtures');
const UA = 'NTK-AI-Income-Hunter/0.3 (fixture capture; read-only; contact: project owner)';

const clip = (value, max) => {
  if (typeof value !== 'string') return value;
  return value.length <= max ? value : `${value.slice(0, max)}…[truncated for fixture]`;
};

async function getText(url) {
  const response = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*' } });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.text();
}

async function getJson(url) {
  return JSON.parse(await getText(url));
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const capturedAt = new Date().toISOString();
  const written = [];

  const save = async (name, data) => {
    const path = join(outDir, name);
    await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    written.push(name);
  };

  // --- Remotive: keep one job with salary text and one without -------------
  const remotive = await getJson('https://remotive.com/api/remote-jobs');
  const remotiveJobs = Array.isArray(remotive.jobs) ? remotive.jobs : [];
  const withSalary = remotiveJobs.filter(j => typeof j.salary === 'string' && j.salary.trim().length > 0).slice(0, 2);
  const withoutSalary = remotiveJobs.filter(j => !j.salary || !j.salary.trim()).slice(0, 1);
  await save('remotive.json', {
    'job-count': remotiveJobs.length,
    'total-job-count': remotiveJobs.length,
    jobs: [...withSalary, ...withoutSalary].map(job => ({
      ...job,
      tags: Array.isArray(job.tags) ? job.tags.slice(0, 8) : [],
      description: clip(job.description, 1200)
    }))
  });

  // --- Remote OK: keep the legal-notice element, which the adapter must skip
  const remoteok = await getJson('https://remoteok.com/api');
  const rkJobs = Array.isArray(remoteok) ? remoteok.filter(x => x && (x.id || x.position)) : [];
  const rkWithSalary = rkJobs.filter(j => j.salary_min > 0).slice(0, 1);
  const rkWithout = rkJobs.filter(j => !(j.salary_min > 0)).slice(0, 1);
  await save('remoteok.json', [
    { last_updated: remoteok[0]?.last_updated ?? null, legal: remoteok[0]?.legal ?? null },
    ...[...rkWithSalary, ...rkWithout].map(job => ({
      ...job,
      tags: Array.isArray(job.tags) ? job.tags.slice(0, 8) : [],
      description: clip(job.description, 1200)
    }))
  ]);

  // --- Arbeitnow: keep one remote and one on-site job ----------------------
  const arbeitnow = await getJson('https://www.arbeitnow.com/api/job-board-api');
  const anData = Array.isArray(arbeitnow.data) ? arbeitnow.data : [];
  const anRemote = anData.filter(j => j.remote === true).slice(0, 1);
  const anOnsite = anData.filter(j => j.remote === false).slice(0, 1);
  await save('arbeitnow.json', {
    data: [...anRemote, ...anOnsite].map(job => ({
      ...job,
      tags: Array.isArray(job.tags) ? job.tags.slice(0, 6) : [],
      description: clip(job.description, 900)
    })),
    links: arbeitnow.links ?? null,
    meta: arbeitnow.meta ?? null
  });

  // --- GitHub: search metadata for bounty issues --------------------------
  const github = await getJson('https://api.github.com/search/issues?q=label%3Abounty%20state%3Aopen&per_page=2');
  await save('github-bounties.json', {
    total_count: github.total_count,
    incomplete_results: github.incomplete_results,
    items: (github.items ?? []).slice(0, 2).map(issue => ({
      number: issue.number,
      title: issue.title,
      html_url: issue.html_url,
      repository_url: issue.repository_url,
      state: issue.state,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      comments: issue.comments,
      labels: (issue.labels ?? []).map(l => ({ name: l.name })),
      user: { login: issue.user?.login },
      body: clip(issue.body ?? '', 700)
    }))
  });

  // --- Hacker News: story metadata via Algolia ----------------------------
  const hn = await getJson('https://hn.algolia.com/api/v1/search_by_date?query=freelancer&tags=story');
  await save('hn-freelancer.json', {
    hits: (hn.hits ?? []).slice(0, 3).map(hit => ({
      objectID: hit.objectID,
      title: hit.title,
      url: hit.url,
      author: hit.author,
      created_at: hit.created_at,
      points: hit.points,
      num_comments: hit.num_comments,
      story_text: clip(hit.story_text ?? '', 400),
      _tags: hit._tags
    }))
  });

  // --- Freelancer RSS: keep the channel header and the first two items ----
  const rss = await getText('https://www.freelancer.com/rss.xml');
  const itemBlocks = rss.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const header = rss.split(/<item[\s\S]*?<\/item>/i)[0] ?? '';
  const trimmedRss = `${header.trim()}\n${itemBlocks.slice(0, 2).join('\n')}\n</channel>\n</rss>\n`;
  await writeFile(join(outDir, 'freelancer-rss.xml'), trimmedRss, 'utf8');
  written.push('freelancer-rss.xml');

  // --- Devpost: one USD prize and one non-USD prize ------------------------
  const devpost = await getJson('https://devpost.com/api/hackathons');
  const hackathons = Array.isArray(devpost.hackathons) ? devpost.hackathons : [];
  const usd = hackathons.filter(h => typeof h.prize_amount === 'string' && h.prize_amount.includes('$')).slice(0, 1);
  const other = hackathons
    .filter(h => typeof h.prize_amount === 'string' && !h.prize_amount.includes('$'))
    .slice(0, 1);
  await save('devpost.json', { hackathons: [...usd, ...other].length ? [...usd, ...other] : hackathons.slice(0, 2) });

  await writeFile(
    join(outDir, 'CAPTURED_AT.json'),
    `${JSON.stringify({ capturedAt, note: 'Trimmed live captures. Regenerate with: node tools/capture-fixtures.mjs', files: written }, null, 2)}\n`,
    'utf8'
  );

  console.log(`Captured ${written.length} fixtures at ${capturedAt}`);
  for (const name of written) console.log(`  - ${name}`);
}

main().catch(error => {
  console.error(`Fixture capture failed: ${error.message}`);
  process.exitCode = 1;
});
