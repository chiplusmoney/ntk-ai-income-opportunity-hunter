import { htmlToText } from '../../evidence/index.js';
import { normalizeCountries } from '../../pipeline/eligibility.js';
import type { EvidenceSnapshot, Tri } from '../../types.js';
import { getSource } from '../registry.js';
import { getText, parseJson } from '../http.js';
import { inferCategory } from '../category.js';
import {
  cleanList,
  emptyResult,
  flat,
  makeCandidate,
  present,
  snapshotOf,
  toIso,
  type AdapterContext,
  type EstablishedField,
  type SourceAdapter,
  type SourceFetchResult
} from './shared.js';

/**
 * Arbeitnow adapter.
 *
 * Endpoint shape verified 2026-10-14: `{ data: [...], links: {...}, meta: {...} }`
 * where `meta.terms` documents the free public use and link-back expectation and
 * `meta.info` documents hourly updates, `created_at` ordering and `?page=` paging.
 *
 * This is a Germany-weighted board and only 13 of 300 sampled items carried
 * `remote: true`; `remote` is a real boolean here, so on-site roles are reported
 * as positively on-site rather than unknown.
 *
 * `location` is a city ("Stuttgart"), not a country, so only explicitly global
 * values are turned into a country code. A bare city yields no country and the
 * candidate is reported as having unknown country eligibility.
 */

interface ArbeitnowJob {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: boolean;
  url?: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: string | number;
}

const MAX_ITEMS_PER_RUN = 300;
const MAX_PAGES = 1;

export const arbeitnowAdapter: SourceAdapter = {
  sourceId: 'arbeitnow',
  description: 'Reads the public Arbeitnow job-board API (paginated, hourly updates).',

  async run(ctx: AdapterContext): Promise<SourceFetchResult> {
    const source = getSource('arbeitnow');
    const fetchedAt = ctx.now().toISOString();
    if (!source) return emptyResult('arbeitnow', fetchedAt, 'Source missing from registry');

    const candidates = [];
    const skipped: { reason: string; ref: string }[] = [];
    let itemsSeen = 0;
    let totalBytes = 0;
    let lastStatus = 0;
    let firstSnapshot: EvidenceSnapshot | null = null;
    const errors: string[] = [];

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const url = page === 1 ? source.endpoint : `${source.endpoint}?page=${page}`;
      const http = await getText(url, {
        fetchImpl: ctx.fetchImpl,
        userAgent: ctx.userAgent,
        timeoutMs: ctx.timeoutMs
      });
      lastStatus = http.status;
      totalBytes += http.bytes;
      if (!http.ok) {
        errors.push(http.error ?? `Request failed for page ${page}`);
        break;
      }

      const { data, error } = parseJson<{ data?: ArbeitnowJob[] }>(http.bodyText);
      if (!data || !Array.isArray(data.data)) {
        errors.push(error ?? `Unreadable payload on page ${page}`);
        break;
      }

      if (!firstSnapshot) {
        try {
          firstSnapshot = await snapshotOf({
            source,
            sourceUrl: url,
            fetchedAt,
            payload: http.bodyText,
            httpStatus: http.status
          });
        } catch (snapshotError) {
          errors.push(`Snapshot failed: ${String(snapshotError)}`);
          break;
        }
      }

      const pageItems = data.data.slice(0, MAX_ITEMS_PER_RUN);
      itemsSeen += pageItems.length;

      for (const job of pageItems) {
        const itemId = present(job.slug) ? job.slug.trim() : null;
        const sourceUrl = present(job.url) ? job.url.trim() : null;
        const title = present(job.title) ? job.title.trim() : null;
        if (!itemId || !sourceUrl || !title) {
          skipped.push({ reason: 'Missing slug, url or title', ref: itemId ?? title ?? '(unidentified item)' });
          continue;
        }

        const descriptionText = htmlToText(present(job.description) ? job.description : '');
        const tags = cleanList(job.tags ?? [], 20);
        const jobTypes = cleanList(job.job_types ?? [], 10);
        const guess = inferCategory(`${title} ${tags.join(' ')} ${descriptionText}`);

        const locationText = present(job.location) ? job.location.trim() : null;
        const countries = normalizeCountries(locationText);
        const remote: Tri = typeof job.remote === 'boolean' ? job.remote : 'unknown';

        const established: EstablishedField[] = [
          { field: 'title', value: title, snapshotIndex: 0, method: 'structured-field', confidence: 1, text: flat(title) },
          { field: 'sourceUrl', value: sourceUrl, snapshotIndex: 0, method: 'structured-field', confidence: 1 },
          {
            field: 'category',
            value: guess.category,
            snapshotIndex: 0,
            method: guess.matched ? 'text-pattern' : 'absent',
            confidence: guess.matched ? 0.7 : 0,
            ...(guess.matched ? { text: guess.matched } : {})
          },
          // `remote` is a published boolean, so both true and false are asserted.
          {
            field: 'remote',
            value: remote === 'unknown' ? 'unknown' : remote,
            snapshotIndex: 0,
            method: typeof job.remote === 'boolean' ? 'structured-field' : 'absent',
            confidence: typeof job.remote === 'boolean' ? 0.95 : 0,
            text: flat(`remote=${String(job.remote)}`)
          }
        ];

        const unknownFields: string[] = [];

        if (present(job.company_name)) {
          established.push({
            field: 'provider',
            value: job.company_name.trim(),
            snapshotIndex: 0,
            method: 'structured-field',
            confidence: 0.9,
            text: flat(job.company_name)
          });
        } else {
          unknownFields.push('provider');
        }

        const publishedAt = toIso(job.created_at);
        if (publishedAt) {
          established.push({
            field: 'publishedAt',
            value: publishedAt,
            snapshotIndex: 0,
            method: 'structured-field',
            confidence: 0.9,
            text: flat(String(job.created_at ?? ''))
          });
        } else {
          unknownFields.push('publishedAt');
        }

        if (jobTypes.length) {
          established.push({
            field: 'jobTypes',
            value: jobTypes.join(', '),
            snapshotIndex: 0,
            method: 'structured-field',
            confidence: 0.55,
            text: flat(jobTypes.join(', '))
          });
        }

        // Arbeitnow publishes no salary field at all.
        unknownFields.push('reward.min', 'reward.max', 'reward.currency', 'reward.basis');

        // A published contract/job type is the source describing paid work.
        const directPay: Tri = jobTypes.length > 0 ? true : 'unknown';
        if (directPay === true) {
          established.push({
            field: 'directPay',
            value: true,
            snapshotIndex: 0,
            method: 'structured-field',
            confidence: 0.65,
            text: flat(`job_types=${jobTypes.join(', ')}`)
          });
        } else {
          unknownFields.push('directPay');
        }

        if (countries.length) {
          established.push({
            field: 'countries',
            value: countries.join(','),
            snapshotIndex: 0,
            method: 'text-pattern',
            confidence: 0.7,
            text: flat(locationText ?? '')
          });
        } else {
          unknownFields.push('countries');
        }

        unknownFields.push('noCvRequired', 'deadline', 'paymentMethods');

        if (tags.length) {
          established.push({
            field: 'skills',
            value: tags.join(', '),
            snapshotIndex: 0,
            method: 'structured-field',
            confidence: 0.5,
            text: flat(tags.join(', '))
          });
        } else {
          unknownFields.push('skills');
        }

        candidates.push(
          makeCandidate({
            source,
            sourceItemId: itemId,
            title,
            provider: present(job.company_name) ? job.company_name.trim() : null,
            category: guess.category,
            description: descriptionText,
            sourceUrl,
            discoveredAt: fetchedAt,
            publishedAt,
            reward: { min: null, max: null, currency: null, basis: 'unknown', raw: null },
            remote,
            directPay,
            noCvRequired: 'unknown',
            countries,
            eligibilityText: locationText,
            skills: tags,
            requirements: [],
            paymentMethods: [],
            deadline: null,
            competition: false,
            snapshots: [firstSnapshot],
            established,
            unknownFields
          })
        );
      }

      if (pageItems.length < MAX_ITEMS_PER_RUN) break;
    }

    return {
      sourceId: 'arbeitnow',
      ok: errors.length === 0,
      httpStatus: lastStatus,
      error: errors.length ? errors.join('; ') : null,
      bytes: totalBytes,
      candidates,
      itemsSeen,
      skipped,
      fetchedAt
    };
  }
};
