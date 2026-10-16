import type { SourceDefinition } from '../types.js';
import { isServable } from './registry.js';

export interface SourceQualification {
  sourceId: string;
  verdict: 'permitted' | 'restricted' | 'prohibited' | 'unreviewed' | 'paid-candidate';
  reviewedAt: string | null;
  references: string[];
  storage: string;
  display: string;
  rateLimit: string;
  categories: string[];
  coverage: string[];
  rewardData: string;
  deadlineData: string;
  countryData: string;
  reenableCondition: string | null;
}

/** Permission is recorded separately from availability. API publication alone is not a grant. */
export const M7_QUALIFICATIONS: Record<string,SourceQualification> = {
  jobicy: {
    sourceId:'jobicy', verdict:'permitted', reviewedAt:'2026-10-16',
    references:['https://jobicy.com/jobs-rss-feed','https://github.com/Jobicy/remote-jobs-api#fair-use','https://jobicy.com/terms-and-conditions','https://jobicy.com/robots.txt'],
    storage:'API-specific fair use permits caching and own products; retain only interface fields and bounded evidence. General website reproduction restrictions do not expand this specific API grant.',
    display:'Own discovery products including public job boards permitted; visible Jobicy attribution and canonical Jobicy URL required. No logo use or downstream syndication.',
    rateLimit:'No new synchronization pass more than hourly. Hunter uses one page of 50 every 360 minutes; no paid direct-ATS API.',
    categories:['jobs','contracts','writing','design','AI evaluation when explicitly listed'],coverage:['Global','US','GB','CA','other explicit source locations'],rewardData:'Optional structured min/max/currency/period',deadlineData:'Not supplied: unknown',countryData:'jobGeo text; unrecognized regions stay unknown',reenableCondition:null
  },
  'weworkremotely': {
    sourceId:'weworkremotely',verdict:'permitted',reviewedAt:'2026-10-16',
    references:['https://weworkremotely.com/remote-job-rss-feed','https://weworkremotely.com/terms-and-conditions','https://weworkremotely.com/robots.txt'],
    storage:'Official invitation to fill a remote job feed authorizes retaining feed listing fields for that display. Bounded excerpts/hashes for internal evidence; no images, profiles or HTML crawling.',
    display:'Public feed reuse explicitly open to anyone with links attributed back to We Work Remotely. Source link is the apply destination.',
    rateLimit:'No numeric feed limit published. Conservative one request per 360 minutes, at most 50 normalized rows.',
    categories:['jobs','contracts','AI training','writing','design','support'],coverage:['Global','US','GB','CA','other explicit source locations'],rewardData:'Unstructured; amount remains unknown unless safely parsed',deadlineData:'Not supplied: unknown',countryData:'Explicit RSS region/country; no headquarters-based eligibility inference',reenableCondition:null
  }
};

export function qualificationFor(source: SourceDefinition): SourceQualification {
  return M7_QUALIFICATIONS[source.id] ?? {
    sourceId:source.id, verdict:source.id === 'devpost' || source.id === 'freelancer-rss' ? 'prohibited' : isServable(source,'public') ? 'permitted' : 'restricted',
    reviewedAt:source.verifiedAt, references:[source.homepage, ...(source.id==='github-bounties' ? ['https://docs.github.com/en/site-policy/github-terms/github-terms-of-service','https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api'] : [])],
    storage:source.permittedUse,display:source.publicDeploymentAllowed ? 'Public display permitted with source attribution/link-back under existing review' : source.publicDeploymentGate ?? 'Not permitted',
    rateLimit:`At least ${source.minIntervalMinutes} minutes; provider terms may be stricter`,categories:[source.kind],coverage:source.marketHints,
    rewardData:'Optional; never inferred',deadlineData:'Optional; never inferred',countryData:'Optional; missing remains unknown',reenableCondition:source.publicDeploymentGate ?? source.disabledReason ?? null
  };
}

/** Researched candidates are not adapters and cannot enter a production crawl plan. */
export const SOURCE_CANDIDATES = [
  { id:'himalayas',category:'Remote jobs',verdict:'RESTRICTED',reference:'https://himalayas.app/terms#api',condition:'Written permission expressly allowing aggregation; current API clause 113(c) bars redistribution to aggregators.',reviewedAt:'2026-10-16' },
  { id:'grants-gov',category:'Grants',verdict:'NOT QUALIFIED',reference:'https://www.grants.gov/api',condition:'Complete API-specific terms, grant eligibility/competition and storage review before any endpoint retrieval.',reviewedAt:'2026-10-16' },
  { id:'usajobs',category:'Direct federal jobs',verdict:'CREDENTIAL AND TERMS REVIEW REQUIRED',reference:'https://developer.usajobs.gov/',condition:'Free authorized API credential plus storage/public display review; no credential obtained.',reviewedAt:null },
  { id:'prolific',category:'Paid research',verdict:'NOT QUALIFIED',reference:'https://docs.prolific.com/',condition:'Participant-opportunity feed permission including multiuser display; researcher integration is not a participant feed grant.',reviewedAt:null },
  { id:'outlier',category:'AI evaluation',verdict:'NOT QUALIFIED',reference:'https://outlier.ai/legal/terms-of-use',condition:'Official listing feed and explicit automated retrieval/storage/display grant; reviewed terms do not grant a public opportunity feed.',reviewedAt:'2026-10-16' },
  { id:'hackerone',category:'Security bounties',verdict:'NOT QUALIFIED',reference:'https://api.hackerone.com/',condition:'Public program redistribution rights and responsible testing scope must be established; API existence alone insufficient.',reviewedAt:null },
  { id:'superteam',category:'Web3 direct work',verdict:'NOT QUALIFIED',reference:'https://earn.superteam.fun/',condition:'Official feed/storage/display permission, jurisdiction and noncustodial/no-capital review.',reviewedAt:null },
  { id:'findwork',category:'Development jobs',verdict:'PAID_SOURCE_CANDIDATE — NOT ENABLED',reference:'https://findwork.dev/developers/',condition:'Developer page redirects to sign-in; price and storage/display rights not verified. Free permanent access and permission or new owner budget authorization required; do not subscribe.',reviewedAt:'2026-10-16' }
] as const;
