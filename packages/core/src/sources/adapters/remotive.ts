import { htmlToText } from '../../evidence/index.js';
import { parseRewardText } from '../../reward.js';
import { normalizeCountries } from '../../pipeline/eligibility.js';
import type { EvidenceSnapshot, NormalizedReward, OpportunityCategory, Tri } from '../../types.js';
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
 * Remotive adapter.
 *
 * Endpoint shape verified 2026-10-14: `{ "job-count": n, "total-job-count": n, "jobs": [...] }`
 * with a `0-legal-notice` string that must be honoured (link back + attribution,
 * no third-party redistribution, max ~4 requests/day — enforced by the registry
 * `minIntervalMinutes`).
 *
 * Fields the source does NOT publish: remote status, CV requirement, deadline,
 * payment method. Those are reported as `unknown`, never guessed.
 */

interface RemotiveJob {
  id?: number | string;
  url?: string;
  title?: string;
  company_name?: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
}

/** job_type values Remotive actually emits, mapped to a payment expectation. */
const PAID_JOB_TYPES = new Set(['full_time', 'part_time', 'contract', 'freelance', 'internship', 'temporary']);

function rewardOf(salary: string | undefined, snapshotIndex: number): {
  reward: NormalizedReward;
  established: EstablishedField[];
  unknown: string[];
} {
  const reward = parseRewardText(salary);
  if (!present(salary)) {
    return { reward, established: [], unknown: ['reward.min', 'reward.max', 'reward.currency', 'reward.basis'] };
  }

  const established: EstablishedField[] = [
    { field: 'reward.raw', value: salary.trim(), snapshotIndex, method: 'structured-field', confidence: 1, text: flat(salary) }
  ];
  const unknown: string[] = [];

  if (reward.min !== null && reward.max !== null) {
    established.push({
      field: 'reward.min',
      value: reward.min,
      snapshotIndex,
      method: 'text-pattern',
      confidence: 0.8,
      text: flat(salary)
    });
    established.push({
      field: 'reward.max',
      value: reward.max,
      snapshotIndex,
      method: 'text-pattern',
      confidence: 0.8,
      text: flat(salary)
    });
  } else {
    unknown.push('reward.min', 'reward.max');
  }

  if (reward.currency) {
    established.push({
      field: 'reward.currency',
      value: reward.currency,
      snapshotIndex,
      method: 'text-pattern',
      confidence: 0.85,
      text: flat(salary)
    });
  } else {
    unknown.push('reward.currency');
  }

  // Basis is only asserted when the salary string carried an explicit period.
  if (reward.basis !== 'unknown') {
    established.push({
      field: 'reward.basis',
      value: reward.basis,
      snapshotIndex,
      method: 'text-pattern',
      confidence: 0.85,
      text: flat(salary)
    });
  } else {
    unknown.push('reward.basis');
  }

  return { reward, established, unknown };
}

export const remotiveAdapter: SourceAdapter = {
  sourceId: 'remotive',
  description: 'Reads the public Remotive jobs API and keeps its link-back and rate commitments.',

  async run(ctx: AdapterContext): Promise<SourceFetchResult> {
    const source = getSource('remotive');
    const fetchedAt = ctx.now().toISOString();
    if (!source) return emptyResult('remotive', fetchedAt, 'Source missing from registry');

    const http = await getText(source.endpoint, {
      fetchImpl: ctx.fetchImpl,
      userAgent: ctx.userAgent,
      timeoutMs: ctx.timeoutMs
    });
    if (!http.ok) {
      return { ...emptyResult('remotive', fetchedAt, http.error ?? 'Request failed'), httpStatus: http.status, bytes: http.bytes };
    }

    const { data, error } = parseJson<{ jobs?: RemotiveJob[] }>(http.bodyText);
    if (!data) {
      return { ...emptyResult('remotive', fetchedAt, error ?? 'Unreadable payload'), httpStatus: http.status, bytes: http.bytes };
    }

    let snapshot: EvidenceSnapshot;
    try {
      snapshot = await snapshotOf({ source, sourceUrl: source.endpoint, fetchedAt, payload: http.bodyText, httpStatus: http.status });
    } catch (snapshotError) {
      return {
        ...emptyResult('remotive', fetchedAt, `Snapshot failed: ${String(snapshotError)}`),
        httpStatus: http.status,
        bytes: http.bytes
      };
    }

    const jobs = Array.isArray(data.jobs) ? data.jobs : [];
    const candidates = [];
    const skipped: { reason: string; ref: string }[] = [];

    for (const job of jobs) {
      const itemId = job.id === undefined || job.id === null ? null : String(job.id);
      const sourceUrl = present(job.url) ? job.url.trim() : null;
      const title = present(job.title) ? job.title.trim() : null;
      if (!itemId || !sourceUrl || !title) {
        skipped.push({ reason: 'Missing id, url or title', ref: itemId ?? title ?? '(unidentified item)' });
        continue;
      }

      const descriptionText = htmlToText(present(job.description) ? job.description : '');
      const tags = cleanList(job.tags ?? [], 20);
      const policyText = [job.category, job.job_type, ...tags].filter(present).join(' ');
      const guess = inferCategory(`${title} ${policyText} ${descriptionText}`);
      const category: OpportunityCategory = guess.category;

      const locationText = present(job.candidate_required_location) ? job.candidate_required_location.trim() : null;
      const countries = normalizeCountries(locationText);
      const jobType = present(job.job_type) ? job.job_type.trim() : null;
      const salary = present(job.salary) ? job.salary : undefined;
      const { reward, established: rewardEstablished, unknown: rewardUnknown } = rewardOf(salary, 0);

      const established: EstablishedField[] = [
        { field: 'title', value: title, snapshotIndex: 0, method: 'structured-field', confidence: 1, text: flat(title) },
        { field: 'sourceUrl', value: sourceUrl, snapshotIndex: 0, method: 'structured-field', confidence: 1 },
        {
          field: 'category',
          value: category,
          snapshotIndex: 0,
          method: guess.matched ? 'text-pattern' : 'absent',
          confidence: guess.matched ? 0.7 : 0,
          ...(guess.matched ? { text: guess.matched } : {})
        },
        ...rewardEstablished
      ];

      const unknownFields: string[] = [...rewardUnknown];

      if (present(job.company_name)) {
        established.push({
          field: 'provider',
          value: job.company_name.trim(),
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 1,
          text: flat(job.company_name)
        });
      } else {
        unknownFields.push('provider');
      }

      established.push({
        field: 'publishedAt',
        value: toIso(job.publication_date) ?? '',
        snapshotIndex: 0,
        method: 'structured-field',
        confidence: 0.95,
        text: flat(String(job.publication_date ?? ''))
      });

      if (countries.length) {
        established.push({
          field: 'countries',
          value: countries.join(','),
          snapshotIndex: 0,
          method: 'text-pattern',
          confidence: 0.8,
          text: flat(locationText ?? '')
        });
      } else {
        unknownFields.push('countries');
      }

      // A job_type of full_time/contract/freelance is the source stating paid
      // engagement; an unrecognised or absent type stays unknown.
      const jobTypeNormalized = jobType?.toLowerCase().replace(/[\s-]/g, '_') ?? null;
      const directPay: Tri = jobTypeNormalized && PAID_JOB_TYPES.has(jobTypeNormalized) ? true : 'unknown';
      if (directPay === true) {
        established.push({
          field: 'directPay',
          value: true,
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.8,
          text: flat(`job_type=${jobType}`)
        });
      } else {
        unknownFields.push('directPay');
      }

      // Not published by Remotive: leave unknown rather than infer.
      unknownFields.push('remote', 'noCvRequired', 'deadline', 'paymentMethods');

      if (tags.length) {
        established.push({
          field: 'skills',
          value: tags.join(', '),
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.6,
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
          category,
          description: descriptionText,
          sourceUrl,
          discoveredAt: fetchedAt,
          publishedAt: toIso(job.publication_date),
          reward,
          remote: 'unknown',
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
      sourceId: 'remotive',
      ok: true,
      httpStatus: http.status,
      error: null,
      bytes: http.bytes,
      candidates,
      itemsSeen: jobs.length,
      skipped,
      fetchedAt
    };
  }
};
