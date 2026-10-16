import type { CategoryPolicy, DeploymentScope, OpportunityCategory, SourceDefinition } from '../types.js';
import { DEFAULT_DEPLOYMENT_SCOPE } from '../types.js';

/**
 * V1 product priority order (V1_PRODUCT_SPEC.md §Priority order).
 * Lower `priority` wins in ranking tie-breaks; competitions are hidden by default.
 */
export const CATEGORY_POLICY: readonly CategoryPolicy[] = [
  { category: 'Development', priority: 1, hiddenByDefault: false },
  { category: 'Bounty', priority: 2, hiddenByDefault: false },
  { category: 'AI Training', priority: 3, hiddenByDefault: false },
  { category: 'Testing', priority: 4, hiddenByDefault: false },
  { category: 'Microtask', priority: 4, hiddenByDefault: false },
  { category: 'Research', priority: 5, hiddenByDefault: false },
  { category: 'Web3', priority: 5, hiddenByDefault: false },
  { category: 'Writing', priority: 6, hiddenByDefault: false },
  { category: 'Design', priority: 6, hiddenByDefault: false },
  { category: 'Grant', priority: 6, hiddenByDefault: false },
  { category: 'Competition', priority: 8, hiddenByDefault: true },
  { category: 'Other', priority: 9, hiddenByDefault: false }
];

export function categoryPriority(category: OpportunityCategory): number {
  return CATEGORY_POLICY.find(p => p.category === category)?.priority ?? 9;
}

export function isHiddenByDefault(category: OpportunityCategory): boolean {
  return CATEGORY_POLICY.find(p => p.category === category)?.hiddenByDefault ?? false;
}

/**
 * The Source Registry.
 *
 * ## How to add an entry
 * 1. Probe the endpoint with a real request and record the status, content type
 *    and payload bytes in `notes`.
 * 2. Read the provider's own terms. If the provider embeds them in the API
 *    payload, quote that; set `termsSource` to the matching provenance value.
 *    Anything you did not read goes in as `unverified`.
 * 3. A source is only `enabled` when `termsReviewed` AND `adapterImplemented`
 *    are both true. `docs/SOURCE_REGISTRY.md` explains each entry.
 *
 * `verifiedAt` is the date of the last live probe. The values below were probed
 * on 2026-10-14; a stale `verifiedAt` means the entry must be re-probed before
 * it is trusted again.
 *
 * `reliability` is an editorial baseline for ranking, not a measured fact.
 */
export const SOURCE_REGISTRY: readonly SourceDefinition[] = [
  {
    id:'jobicy',name:'Jobicy',kind:'jobs-api',access:'public-api',homepage:'https://jobicy.com',endpoint:'https://jobicy.com/api/v2/remote-jobs?count=50',attribution:'Jobicy',
    permittedUse:'API-specific Fair Use explicitly permits own websites, job boards and discovery products, caching and summaries. Preserve Jobicy as source and the canonical Jobicy URL. See qualification record for reviewed general terms and fair-use references.',
    termsSource:'provider-documentation',termsReviewed:true,verifiedAt:'2026-10-16',requiresLinkBack:true,minIntervalMinutes:360,adapterImplemented:true,enabled:true,publicDeploymentAllowed:true,reliability:78,directPayExpected:'unknown',marketHints:['Global','US','GB','CA'],notes:'One public page; no paid direct application URL service. Unknown fields stay unknown.'
  },
  {
    id:'weworkremotely',name:'We Work Remotely',kind:'rss',access:'public-rss',homepage:'https://weworkremotely.com',endpoint:'https://weworkremotely.com/remote-jobs.rss',attribution:'We Work Remotely',
    permittedUse:'Official Public RSS Feed page expressly invites anyone to fill a remote job feed using its openings, provided links are attributed back to We Work Remotely. RSS only; no site scraping, images or profile retrieval.',
    termsSource:'provider-documentation',termsReviewed:true,verifiedAt:'2026-10-16',requiresLinkBack:true,minIntervalMinutes:360,adapterImplemented:true,enabled:true,publicDeploymentAllowed:true,reliability:80,directPayExpected:'unknown',marketHints:['Global','US','GB','CA'],notes:'Conservative six-hour floor, 50 rows maximum. Region is eligibility, headquarters is not.'
  },
  {
    id: 'remotive',
    name: 'Remotive',
    kind: 'jobs-api',
    access: 'public-api',
    homepage: 'https://remotive.com',
    endpoint: 'https://remotive.com/api/remote-jobs',
    attribution: 'Remotive',
    permittedUse:
      "The API's own payload states: API documentation and access is granted so developers can share Remotive jobs further; jobs must not be submitted to third-party job boards (Jooble, Neuvoo, Google Jobs, LinkedIn Jobs named); each listing must link back to the Remotive URL and name Remotive as the source; displaying the jobs in order to collect signups or email addresses is a breach of the terms; jobs are delayed by 24 hours; no need to request data more than about 4 times a day and excessive requests are blocked.",
    termsSource: 'api-payload-legal-notice',
    termsReviewed: true,
    verifiedAt: '2026-10-14',
    requiresLinkBack: true,
    // Remotive states a maximum of ~4 requests/day. 1440 / 4 = 360 minutes.
    minIntervalMinutes: 360,
    adapterImplemented: true,
    enabled: true,
    publicDeploymentAllowed: true,
    reliability: 82,
    directPayExpected: true,
    marketHints: ['Worldwide'],
    notes:
      'Probed 2026-10-14: HTTP 200, application/json, ~189 KB. `salary` is free text and is frequently an empty string; it is parsed conservatively and left unknown when not machine-readable. `candidate_required_location` carries real eligibility text ("Worldwide", "Americas, Europe, Israel", "USA, Canada, USA timezones").'
  },
  {
    id: 'remoteok',
    name: 'Remote OK',
    kind: 'jobs-api',
    access: 'public-api',
    homepage: 'https://remoteok.com',
    endpoint: 'https://remoteok.com/api',
    attribution: 'Remote OK',
    permittedUse:
      "The API's own payload states: link back (with follow, and without nofollow!) to the Remote OK job URL and mention Remote OK as a source, otherwise API access is suspended; the Remote OK logo may not be used without written permission because it is a registered trademark, though the name may be used.",
    termsSource: 'api-payload-legal-notice',
    termsReviewed: true,
    verifiedAt: '2026-10-14',
    requiresLinkBack: true,
    minIntervalMinutes: 60,
    adapterImplemented: true,
    enabled: true,
    publicDeploymentAllowed: true,
    reliability: 80,
    directPayExpected: true,
    marketHints: ['Remote', 'Global'],
    notes:
      'Probed 2026-10-14: HTTP 200, application/json, ~601 KB, 100 array elements. Element 0 is the legal notice and is skipped by the adapter. `salary_min`/`salary_max` are numeric but the pay period is NOT stated (19 of 99 items carried a salary; values ranged from 40-48 to 145000-220000, so both hourly and annual figures appear), therefore `basis` stays unknown. `location` is sometimes empty and sometimes a city, so remote status stays unknown unless the value is exactly "Remote".'
  },
  {
    id: 'arbeitnow',
    name: 'Arbeitnow',
    kind: 'jobs-api',
    access: 'public-api',
    homepage: 'https://www.arbeitnow.com',
    endpoint: 'https://www.arbeitnow.com/api/job-board-api',
    attribution: 'Arbeitnow',
    permittedUse:
      "The API's own meta states: \"This is a free public API for jobs, please do not abuse. I would appreciate linking back to the site. By using the API, you agree to the terms of service present on Arbeitnow.com\". The same meta documents hourly updates, ordering by created_at and pagination via ?page=.",
    termsSource: 'api-response-metadata',
    termsReviewed: true,
    verifiedAt: '2026-10-14',
    requiresLinkBack: true,
    minIntervalMinutes: 60,
    adapterImplemented: true,
    enabled: true,
    publicDeploymentAllowed: true,
    reliability: 74,
    directPayExpected: 'unknown',
    marketHints: ['DE', 'EU'],
    notes:
      'Probed 2026-10-14: HTTP 200, application/json, ~2.4 MB, 300 items per page with a `links` object for pagination. `remote` is a real boolean and only 13 of 300 sampled items were remote; the rest are German on-site roles and are expected to fail the remote check. `job_types` is uncontrolled multilingual text ("Vollzeit", "Werkstudent", "Full-Time", ...) and is not used as a payment signal.'
  },
  {
    id: 'github-bounties',
    name: 'GitHub Issue Bounties',
    kind: 'bounty-api',
    access: 'public-api',
    homepage: 'https://github.com',
    // The bare /search/issues path answers HTTP 422 without a `q` parameter, so
    // the registry stores the qualified query the adapter actually issues.
    endpoint: 'https://api.github.com/search/issues?q=label%3Abounty+state%3Aopen',
    attribution: 'GitHub',
    permittedUse:
      'Public GitHub REST search API used unauthenticated for read-only issue metadata. Measured on 2026-10-14 via GET /rate_limit: 10 search requests per minute and 60 core requests per hour without credentials. Only issue metadata and its own html_url are retained; repository contents are never fetched. Use is subject to the GitHub Terms of Service.',
    termsSource: 'live-probe-only',
    termsReviewed: true,
    verifiedAt: '2026-10-14',
    requiresLinkBack: true,
    minIntervalMinutes: 60,
    adapterImplemented: true,
    enabled: true,
    publicDeploymentAllowed: true,
    reliability: 66,
    directPayExpected: 'unknown',
    marketHints: ['Global'],
    notes:
      'Probed 2026-10-14: HTTP 200 for `label:bounty state:open` with total_count 4260; the unparameterised /search/issues path returns 422, which is why the query lives in the registered endpoint. Measured via GET /rate_limit: 10 search requests/minute and 60 core requests/hour unauthenticated. The bounty label is not a payout guarantee: GitHub exposes no structured amount field, so `reward` stays unknown and the risk model flags unverified bounty claims. The first page of live results was dominated by promotional aggregator repositories rather than real bounties, so low-reliability handling matters here.'
  },
  {
    id: 'devpost',
    name: 'Devpost Hackathons',
    kind: 'hackathon-api',
    access: 'public-api',
    homepage: 'https://devpost.com',
    endpoint: 'https://devpost.com/api/hackathons',
    attribution: 'Devpost',
    permittedUse:
      'Prohibited. Devpost Terms of Service §4 states users agree not to use the Site in a manner that "Uses manual or automated software, devices, scripts robots, or other means or processes to access, \'scrape,\' \'crawl\' or \'spider\' the Site, User Content (including User Profiles and Team Pages), or any related data or information" (https://devpost.com/terms). The prohibition covers the listing endpoint and there are no Devpost API terms granting an exception.',
    termsSource: 'unverified',
    termsReviewed: false,
    verifiedAt: '2026-10-14',
    requiresLinkBack: true,
    minIntervalMinutes: 180,
    adapterImplemented: true,
    enabled: false,
    disabledReason:
      'Devpost Terms of Service §4 prohibits automated access to the Site and to any related data. No official Devpost API or API terms exist. Enabling requires written permission from Devpost — the endpoint returning HTTP 200 is not permission.',
    /** Public display of Devpost listings is prohibited, not merely unverified. */
    publicDeploymentAllowed: false,
    publicDeploymentGate:
      'Written permission from Devpost (or published Devpost API terms) authorising automated retrieval and display of listing data.',
    reliability: 70,
    directPayExpected: false,
    marketHints: ['Global'],
    notes:
      'Probed 2026-10-14: HTTP 200, application/json, ~10 KB, 9 hackathons. `prize_amount` is an HTML fragment such as `$<span data-currency-value>138,000</span>` and one live entry quoted INR. The adapter is kept, tested and switched off: the compliance review (docs/SOURCE_COMPLIANCE_REVIEW.md) found an explicit prohibition, so this is a legal block, not a technical one.'
  },
  {
    id: 'hn-freelancer',
    name: 'Hacker News Freelancer Threads',
    kind: 'bounty-api',
    access: 'public-api',
    homepage: 'https://news.ycombinator.com',
    endpoint: 'https://hn.algolia.com/api/v1/search_by_date',
    attribution: 'Hacker News (via Algolia)',
    permittedUse:
      'Permitted for personal, non-commercial use, API-only. The operator publishes the API for third-party programmatic access: "It enables developers to access HN data programmatically using a REST API" and "We are limiting the number of API requests from a single IP to 10,000 per hour" (hn-search repo, app/javascript/views/Api.tsx, read 2026-10-14). Y Combinator’s Terms of Use prohibit scraping or data mining of the Site and commercial display or distribution of it, but do not reach personal, non-commercial storage of API metadata. Conditions: use the API only (never parse news.ycombinator.com HTML), stay far inside the rate budget, link back to the HN item, keep excerpts bounded, and re-review before any commercial use.',
    termsSource: 'provider-documentation',
    termsReviewed: true,
    verifiedAt: '2026-10-14',
    requiresLinkBack: true,
    minIntervalMinutes: 120,
    adapterImplemented: true,
    enabled: true,
    /**
     * NOT permitted for a multi-user deployment. YC's Terms of Use restrict
     * distributing Site Content except where "expressly authorized by Y
     * Combinator", and no located document grants that for public display.
     */
    publicDeploymentAllowed: false,
    publicDeploymentGate:
      'Express written authorisation from Y Combinator covering redistribution or public display of HN story metadata (nothing in the YC Terms of Use, the HN Guidelines/FAQ or the official HN API grants it). See docs/SOURCE_COMPLIANCE_REVIEW_HN_MULTIUSER.md.',
    reliability: 62,
    directPayExpected: 'unknown',
    marketHints: ['Global'],
    notes:
      'Probed 2026-10-14: HTTP 200, application/json, ~32 KB, 20 hits with title, url, created_at, objectID, points, author. Community postings; direct-pay and reward are unstructured, so both stay unknown and confidence is capped. Enabled only for reading through the API host; the adapter links to the HN item page, never to the Algolia API URL, and holds no HN HTML. Compliance review: docs/SOURCE_COMPLIANCE_REVIEW.md.'
  },
  {
    id: 'freelancer-rss',
    name: 'Freelancer.com Projects RSS',
    kind: 'rss',
    access: 'public-rss',
    homepage: 'https://www.freelancer.com',
    endpoint: 'https://www.freelancer.com/rss.xml',
    attribution: 'Freelancer.com',
    permittedUse:
      'Prohibited without express written permission. Freelancer User Agreement §33: "You agree that you will not use any robot, spider, scraper or other automated means to access the Website via any means, including for the avoidance of doubt access to our API or application programming interface, for any purpose without our express written permission." §4 item 11 forbids downloading and aggregating "listings from our website for display with listings from other websites" without express written permission — which is exactly this product’s pattern. The Freelancer API T&Cs §5.3 additionally bar storing "any Data or … any information expressed by the Data (such as hashed or transferred data)", which rules out this project’s snapshot-hash evidence model.',
    termsSource: 'unverified',
    termsReviewed: false,
    verifiedAt: '2026-10-14',
    requiresLinkBack: true,
    minIntervalMinutes: 60,
    adapterImplemented: true,
    enabled: false,
    disabledReason:
      'Freelancer.com prohibits this use: User Agreement §33 requires express written permission for automated access including API access, §4 item 11 forbids cross-site aggregation of listings, and API T&Cs §5.3 bars storing the data or information expressed by it (such as a hash). Enabling requires express written permission from Freelancer.',
    /** Freelancer prohibits this use outright, including storing a hash. */
    publicDeploymentAllowed: false,
    publicDeploymentGate:
      'Express written permission from Freelancer covering automated retrieval AND storage/display of listing data (their API terms allow caching only, and forbid storing the data or information expressed by it).',
    reliability: 68,
    directPayExpected: true,
    marketHints: ['Global'],
    notes:
      'Probed 2026-10-14: HTTP 200, text/xml, ~75 KB, 20 items; all 20 carried a title and a "(Budget: … , Jobs: …)" clause, and `guid` is a stable per-project id. The adapter is kept and tested but must stay off: this is a legal block, not a technical one. Note that §5.3 also forbids the hashed-evidence pattern used here, so even a cache-only design would need written permission.'
  }
];

export function getSource(id: string): SourceDefinition | undefined {
  return SOURCE_REGISTRY.find(s => s.id === id);
}

/**
 * Is this source's terms review enough for the given audience?
 *
 * `disabledSourcesFor` reports the two reasons separately, because they are
 * different problems: "we have not read the terms" versus "the terms do not
 * cover showing this to the public".
 */
export function sourceScopeProblem(
  source: SourceDefinition,
  scope: DeploymentScope = DEFAULT_DEPLOYMENT_SCOPE
): string | null {
  if (!source.adapterImplemented) return `No adapter is implemented for ${source.id}.`;
  if (!source.termsReviewed) return source.disabledReason ?? `Terms for ${source.id} have not been read.`;
  if (!source.enabled) return source.disabledReason ?? `${source.id} is switched off in the registry.`;
  if (scope === 'public' && !source.publicDeploymentAllowed) {
    // Always name what would lift the restriction.
    return (
      source.publicDeploymentGate ??
      `${source.id} may not be displayed in a multi-user deployment on the terms read so far.`
    );
  }
  return null;
}

/** A source is served only when it is implemented, reviewed, on, and scoped. */
export function isServable(
  source: SourceDefinition,
  scope: DeploymentScope = DEFAULT_DEPLOYMENT_SCOPE
): boolean {
  return sourceScopeProblem(source, scope) === null;
}

export function enabledSources(scope: DeploymentScope = DEFAULT_DEPLOYMENT_SCOPE): SourceDefinition[] {
  return SOURCE_REGISTRY.filter(source => isServable(source, scope));
}

/** Sources that are deliberately not serving, with the reason for this scope. */
export function disabledSources(scope: DeploymentScope = DEFAULT_DEPLOYMENT_SCOPE): SourceDefinition[] {
  return SOURCE_REGISTRY.filter(source => !isServable(source, scope));
}

/**
 * Crawl intervals expressed as a per-source schedule decision.
 * Returns true when enough time has passed since the last run of this source.
 */
export function isDueForCrawl(
  source: SourceDefinition,
  lastRunAt: string | null,
  now: Date
): boolean {
  if (!lastRunAt) return true;
  const last = Date.parse(lastRunAt);
  if (!Number.isFinite(last)) return true;
  const elapsedMinutes = (now.getTime() - last) / 60_000;
  // A clock skew that puts the last run in the future must not stall the source.
  if (elapsedMinutes < 0) return true;
  return elapsedMinutes >= source.minIntervalMinutes;
}
