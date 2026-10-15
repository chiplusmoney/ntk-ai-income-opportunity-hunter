import { htmlToText } from '../../evidence/index.js';
import { normalizeCountries } from '../../pipeline/eligibility.js';
import type { EvidenceSnapshot, NormalizedReward, Tri } from '../../types.js';
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
 * Remote OK adapter.
 *
 * Endpoint shape verified 2026-10-14: a JSON array whose element 0 is the
 * provider's legal notice (link back with follow, no nofollow, name Remote OK
 * as the source) and whose remaining elements are job objects.
 *
 * Two fields are deliberately left unknown:
 *  - `basis`: salary_min/salary_max are numbers with no stated period. Live data
 *    contains both 40-48 (clearly not annual) and 145000-220000, so no single
 *    period can be assumed.
 *  - `currency`: the feed publishes bare numbers with no currency marker.
 */

interface RemoteOkJob {
  id?: string | number;
  slug?: string;
  date?: string;
  epoch?: number;
  company?: string;
  position?: string;
  tags?: string[];
  description?: string;
  location?: string;
  apply_url?: string;
  url?: string;
  salary_min?: number;
  salary_max?: number;
}

export const remoteOkAdapter: SourceAdapter = {
  sourceId: 'remoteok',
  description: 'Reads the public Remote OK API, skipping the leading legal-notice element.',

  async run(ctx: AdapterContext): Promise<SourceFetchResult> {
    const source = getSource('remoteok');
    const fetchedAt = ctx.now().toISOString();
    if (!source) return emptyResult('remoteok', fetchedAt, 'Source missing from registry');

    const http = await getText(source.endpoint, {
      fetchImpl: ctx.fetchImpl,
      userAgent: ctx.userAgent,
      timeoutMs: ctx.timeoutMs
    });
    if (!http.ok) {
      return { ...emptyResult('remoteok', fetchedAt, http.error ?? 'Request failed'), httpStatus: http.status, bytes: http.bytes };
    }

    const { data, error } = parseJson<RemoteOkJob[]>(http.bodyText);
    if (!Array.isArray(data)) {
      return {
        ...emptyResult('remoteok', fetchedAt, error ?? 'Payload was not the expected JSON array'),
        httpStatus: http.status,
        bytes: http.bytes
      };
    }

    let snapshot: EvidenceSnapshot;
    try {
      snapshot = await snapshotOf({ source, sourceUrl: source.endpoint, fetchedAt, payload: http.bodyText, httpStatus: http.status });
    } catch (snapshotError) {
      return {
        ...emptyResult('remoteok', fetchedAt, `Snapshot failed: ${String(snapshotError)}`),
        httpStatus: http.status,
        bytes: http.bytes
      };
    }

    // Element 0 is the legal notice, not a job.
    const items = data.filter(
      (item): item is RemoteOkJob =>
        Boolean(item) && typeof item === 'object' && (item.id !== undefined || present(item.position))
    );

    const candidates = [];
    const skipped: { reason: string; ref: string }[] = [];

    for (const job of items) {
      const itemId = job.id === undefined || job.id === null ? null : String(job.id);
      const sourceUrl = present(job.url) ? job.url.trim() : present(job.apply_url) ? job.apply_url.trim() : null;
      const title = present(job.position) ? job.position.trim() : null;
      if (!itemId || !sourceUrl || !title) {
        skipped.push({ reason: 'Missing id, url or position', ref: itemId ?? title ?? '(unidentified item)' });
        continue;
      }

      const descriptionText = htmlToText(present(job.description) ? job.description : '');
      const tags = cleanList(job.tags ?? [], 20);
      const guess = inferCategory(`${title} ${tags.join(' ')} ${descriptionText}`);

      const locationText = present(job.location) ? job.location.trim() : null;
      // "Remote" is the only location value that states remote status directly.
      const remote: Tri = locationText && /^remote$/i.test(locationText) ? true : 'unknown';

      const hasMin = typeof job.salary_min === 'number' && job.salary_min > 0;
      const hasMax = typeof job.salary_max === 'number' && job.salary_max > 0;
      const reward: NormalizedReward = hasMin || hasMax
        ? {
            min: hasMin ? (job.salary_min as number) : (job.salary_max as number),
            max: hasMax ? (job.salary_max as number) : (job.salary_min as number),
            currency: null,
            basis: 'unknown',
            raw: `salary_min=${job.salary_min ?? ''}; salary_max=${job.salary_max ?? ''} (period and currency not stated by the feed)`
          }
        : { min: null, max: null, currency: null, basis: 'unknown', raw: null };

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
        }
      ];

      const unknownFields: string[] = ['reward.currency', 'reward.basis'];

      if (present(job.company)) {
        established.push({
          field: 'provider',
          value: job.company.trim(),
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.95,
          text: flat(job.company)
        });
      } else {
        unknownFields.push('provider');
      }

      const publishedAt = toIso(job.date) ?? toIso(job.epoch);
      if (publishedAt) {
        established.push({
          field: 'publishedAt',
          value: publishedAt,
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.95,
          text: flat(String(job.date ?? job.epoch ?? ''))
        });
      } else {
        unknownFields.push('publishedAt');
      }

      if (reward.min !== null) {
        established.push(
          { field: 'reward.min', value: reward.min, snapshotIndex: 0, method: 'structured-field', confidence: 0.9, text: flat(reward.raw ?? '') },
          { field: 'reward.max', value: reward.max as number, snapshotIndex: 0, method: 'structured-field', confidence: 0.9, text: flat(reward.raw ?? '') }
        );
      } else {
        unknownFields.push('reward.min', 'reward.max');
      }

      if (remote === true) {
        established.push({
          field: 'remote',
          value: true,
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.9,
          text: flat(locationText ?? 'Remote')
        });
      } else {
        unknownFields.push('remote');
      }

      // Company name plus a reachable posting URL is the source showing a real
      // engagement; anything less stays unknown.
      const directPay: Tri = present(job.company) ? true : 'unknown';
      if (directPay === true) {
        established.push({
          field: 'directPay',
          value: true,
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.7,
          text: flat(`company=${job.company}`)
        });
      } else {
        unknownFields.push('directPay');
      }

      const countries = normalizeCountries(locationText);
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
          confidence: 0.55,
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
          provider: present(job.company) ? job.company.trim() : null,
          category: guess.category,
          description: descriptionText,
          sourceUrl,
          discoveredAt: fetchedAt,
          publishedAt,
          reward,
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
          snapshots: [snapshot],
          established,
          unknownFields
        })
      );
    }

    return {
      sourceId: 'remoteok',
      ok: true,
      httpStatus: http.status,
      error: null,
      bytes: http.bytes,
      candidates,
      itemsSeen: items.length,
      skipped,
      fetchedAt
    };
  }
};
