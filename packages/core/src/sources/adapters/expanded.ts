import { htmlToText } from '../../evidence/index.js';
import { normalizeCountries } from '../../pipeline/eligibility.js';
import type { NormalizedReward, Tri } from '../../types.js';
import { inferCategory } from '../category.js';
import { getText, parseJson } from '../http.js';
import { getSource } from '../registry.js';
import { parseRss } from './rss.js';
import { emptyResult, makeCandidate, snapshotOf, toIso, type EstablishedField, type SourceAdapter } from './shared.js';

const string = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const list = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0,30) : [];
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
const periods: Record<string,NormalizedReward['basis']> = { hourly:'hour',daily:'day',weekly:'week',monthly:'month',yearly:'year',annually:'year',annual:'year' };

/** Only these two registry endpoints are fetched. No follow-up employer URL fetch is allowed. */
function adapter(sourceId: 'jobicy' | 'weworkremotely'): SourceAdapter {
  return { sourceId,description:'Permission-qualified bounded public feed with conservative extraction',async run(ctx) {
    const at = ctx.now().toISOString(); const source = getSource(sourceId);
    if (!source) return emptyResult(sourceId,at,'Registry entry missing');
    const http = await getText(source.endpoint,ctx);
    if (!http.ok || http.truncated) return { ...emptyResult(sourceId,at,http.error ?? 'Oversized response'),httpStatus:http.status,bytes:http.bytes };
    const result = { ...emptyResult(sourceId,at,null),ok:true,httpStatus:http.status,bytes:http.bytes };
    let rows: Record<string,unknown>[];
    if (sourceId === 'jobicy') {
      const parsed = parseJson<{ jobs?:unknown }>(http.bodyText);
      if (!Array.isArray(parsed.data?.jobs)) return { ...result,ok:false,error:parsed.error ?? 'Missing jobs array' };
      rows = parsed.data.jobs.slice(0,50).map(x => x && typeof x === 'object' ? x as Record<string,unknown> : {});
    } else {
      if (!/<rss[\s>]/i.test(http.bodyText)) return { ...result,ok:false,error:'Expected RSS document' };
      const rss = parseRss(http.bodyText,50);
      // Preserve explicit RSS fields; a city/headquarters never supplies a country.
      const blocks = [...http.bodyText.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0,50);
      rows = rss.items.map((x,i) => {
        const extra = (tag: string) => htmlToText(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`,'i').exec(blocks[i]?.[1] ?? '')?.[1] ?? '');
        return { ...x, region:extra('region'),country:extra('country'),skills:extra('skills'),type:extra('type') };
      });
    }
    result.itemsSeen = rows.length;
    const snapshot = await snapshotOf({ source,sourceUrl:source.endpoint,fetchedAt:at,payload:http.bodyText,httpStatus:http.status });
    for (const row of rows) {
      const url = string(sourceId === 'jobicy' ? row.url : row.link);
      const fullTitle = htmlToText(string(sourceId === 'jobicy' ? row.jobTitle : row.title));
      const itemId = sourceId === 'jobicy' ? String(row.id ?? '') : /\/([^/?#]+)\/?(?:\?.*)?$/.exec(url)?.[1] ?? '';
      let validUrl = false;
      try { const u = new URL(url);validUrl = u.protocol === 'https:' && !u.username && !u.password && u.hostname === new URL(source.homepage).hostname; } catch { /* malformed items are counted */ }
      if (!fullTitle || !/^[\w.-]{1,180}$/.test(itemId) || !validUrl) { result.skipped.push({ reason:'Missing title/ID or noncanonical source URL',ref:itemId.slice(0,180) });continue; }
      const separator = fullTitle.indexOf(':');
      const provider = sourceId === 'jobicy' ? string(row.companyName) : separator > 0 ? fullTitle.slice(0,separator).trim() : '';
      const title = sourceId === 'weworkremotely' && separator > 0 ? fullTitle.slice(separator+1).trim() : fullTitle;
      const description = htmlToText(string(sourceId === 'jobicy' ? row.jobDescription : row.description)).slice(0,18000);
      const location = sourceId === 'jobicy' ? string(row.jobGeo) : [string(row.region),string(row.country)].filter(Boolean).join(', ');
      const countries = /^(?:anywhere(?: in the world)?|worldwide|global)$/i.test(location) ? ['GLOBAL'] : normalizeCountries(location);
      const publishedAt = toIso(string(sourceId === 'jobicy' ? row.pubDate : row.pubDate));
      const category = /AI coding tasks|train AI coding models/i.test(`${title} ${description}`) ? 'AI Training' : inferCategory(`${title} ${list(row.jobIndustry).join(' ')} ${list(row.categories).join(' ')}`).category;
      let reward: NormalizedReward = { min:null,max:null,currency:null,basis:'unknown',raw:null };
      if (sourceId === 'jobicy') {
        const min = number(row.salaryMin), max = number(row.salaryMax), currency = string(row.salaryCurrency);
        if ((min !== null || max !== null) && /^[A-Z]{3}$/.test(currency) && !(min !== null && max !== null && min > max)) reward = { min,max,currency,basis:periods[string(row.salaryPeriod).toLowerCase()] ?? 'unknown',raw:JSON.stringify({ salaryMin:min,salaryMax:max,salaryCurrency:currency,salaryPeriod:row.salaryPeriod ?? null }) };
      } // RSS prose can contain benefits, donations or company revenue; no generic amount extraction.
      const jobTypes = sourceId === 'jobicy' ? list(row.jobType).join(' ') : string(row.type);
      const directPay: Tri = reward.min !== null || reward.max !== null || /\bpaid (?:task|contract|work)|\$[\d,]+ per task/i.test(description) ? true : 'unknown';
      const established: EstablishedField[] = [
        {field:'title',value:title,method:'structured-field',snapshotIndex:0,confidence:1},
        {field:'sourceUrl',value:url,method:'structured-field',snapshotIndex:0,confidence:1},
        {field:'remote',value:true,method:'structured-field',snapshotIndex:0,confidence:0.9,text:'Official remote job feed'},
        {field:'category',value:category,method:'text-pattern',snapshotIndex:0,confidence:0.7,text:title.slice(0,200)}
      ];
      if (provider) established.push({field:'provider',value:provider,method:'structured-field',snapshotIndex:0,confidence:0.9});
      if (publishedAt) established.push({field:'publishedAt',value:publishedAt,method:'structured-field',snapshotIndex:0,confidence:0.9});
      if (countries.length) established.push({field:'countries',value:countries.join(','),method:'text-pattern',snapshotIndex:0,confidence:0.9,text:location.slice(0,200)});
      if (directPay === true) established.push({field:'directPay',value:true,method:'text-pattern',snapshotIndex:0,confidence:0.85,text:reward.raw ?? description.match(/.{0,40}(?:paid task|per task).{0,60}/i)?.[0] ?? 'Structured salary'});
      for (const key of ['min','max','currency','basis'] as const) if (reward[key] !== null && reward[key] !== 'unknown') established.push({field:`reward.${key}`,value:reward[key]!,method:'structured-field',snapshotIndex:0,confidence:0.9,text:reward.raw ?? ''});
      const unknownFields = ['deadline','noCvRequired','noPortfolioRequired','paymentMethods','experience','noCapitalRequired',...(!countries.length ? ['countries'] : []),...(!provider ? ['provider'] : []),...(!publishedAt ? ['publishedAt'] : []),...(directPay === 'unknown' ? ['directPay'] : []),...(['min','max','currency','basis'] as const).filter(k => reward[k] === null || reward[k] === 'unknown').map(k=>`reward.${k}`)];
      result.candidates.push(makeCandidate({ source,sourceItemId:itemId,title,provider,category,description,sourceUrl:url,discoveredAt:at,publishedAt,reward,remote:true,directPay,noCvRequired:'unknown',countries,eligibilityText:location || null,skills:[],requirements:jobTypes ? [`Source employment type: ${jobTypes}`] : [],paymentMethods:[],deadline:null,competition:false,snapshots:[snapshot],established,unknownFields }));
    }
    return result;
  }};
}
export const jobicyAdapter = adapter('jobicy');
export const weWorkRemotelyAdapter = adapter('weworkremotely');
