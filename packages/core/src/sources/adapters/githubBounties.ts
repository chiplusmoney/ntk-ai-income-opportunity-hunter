import { excerpt } from '../../evidence/index.js';
import type { Tri } from '../../types.js';
import { getSource } from '../registry.js';
import { getText, parseJson } from '../http.js';
import { inferCategory, isCompetitiveText } from '../category.js';
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
 * GitHub issue-bounty adapter.
 *
 * Uses the public, unauthenticated search API. The registry endpoint already
 * carries the `q` parameter (a bare /search/issues answers 422).
 * Measured on 2026-10-14 via GET /rate_limit: 10 search requests per minute,
 * 60 core requests per hour. One search request is issued per run and the
 * registry interval keeps that inside the documented budget.
 *
 * GitHub publishes NO payout field, so `reward` is always unknown here and the
 * risk model flags an unverified bounty claim. Only issue metadata and the
 * issue's own html_url are read; repository contents are never fetched.
 */

interface GitHubIssue {
  number?: number;
  title?: string;
  html_url?: string;
  repository_url?: string;
  state?: string;
  created_at?: string;
  updated_at?: string;
  body?: string | null;
  labels?: { name?: string }[];
  user?: { login?: string };
  comments?: number;
}

const QUERY = 'label:bounty state:open';
const PER_PAGE = 30;
/** Turn https://api.github.com/repos/owner/name into owner/name. */
function repoFullName(repositoryUrl: string | undefined): string | null {
  if (!present(repositoryUrl)) return null;
  const match = /repos\/([^/]+\/[^/]+)$/.exec(repositoryUrl.trim());
  return match?.[1] ?? null;
}

export const githubBountiesAdapter: SourceAdapter = {
  sourceId: 'github-bounties',
  description: 'Searches public GitHub issues labelled bounty; read-only metadata only.',

  async run(ctx: AdapterContext): Promise<SourceFetchResult> {
    const source = getSource('github-bounties');
    const fetchedAt = ctx.now().toISOString();
    if (!source) return emptyResult('github-bounties', fetchedAt, 'Source missing from registry');

    const url = `${source.endpoint}&per_page=${PER_PAGE}&sort=created&order=desc`;
    const http = await getText(url, {
      fetchImpl: ctx.fetchImpl,
      userAgent: ctx.userAgent,
      timeoutMs: ctx.timeoutMs,
      headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }
    });

    if (!http.ok) {
      return {
        ...emptyResult('github-bounties', fetchedAt, http.error ?? 'Request failed'),
        httpStatus: http.status,
        bytes: http.bytes
      };
    }

    const { data, error } = parseJson<{ items?: GitHubIssue[]; total_count?: number }>(http.bodyText);
    if (!data || !Array.isArray(data.items)) {
      return {
        ...emptyResult('github-bounties', fetchedAt, error ?? 'No items array in response'),
        httpStatus: http.status,
        bytes: http.bytes
      };
    }

    const snapshot = await snapshotOf({
      source,
      sourceUrl: url,
      fetchedAt,
      payload: http.bodyText,
      httpStatus: http.status
    });

    const candidates = [];
    const skipped: { reason: string; ref: string }[] = [];

    for (const issue of data.items) {
      const itemId = issue.number === undefined || issue.number === null ? null : String(issue.number);
      const repo = repoFullName(issue.repository_url);
      const title = present(issue.title) ? issue.title.trim() : null;
      const sourceUrl = present(issue.html_url) ? issue.html_url.trim() : null;
      if (!itemId || !repo || !title || !sourceUrl) {
        skipped.push({ reason: 'Missing number, repository, title or html_url', ref: itemId ?? title ?? '(unidentified issue)' });
        continue;
      }

      const labelNames = cleanList((issue.labels ?? []).map(l => l.name ?? null), 15);
      const bodyText = present(issue.body ?? '') ? (issue.body as string).replace(/\s+/g, ' ').trim() : '';
      const searchable = `${title} ${bodyText}`;
      const guess = inferCategory(searchable);
      const competition = isCompetitiveText(searchable);

      const established: EstablishedField[] = [
        { field: 'title', value: title, snapshotIndex: 0, method: 'structured-field', confidence: 1, text: flat(title) },
        { field: 'sourceUrl', value: sourceUrl, snapshotIndex: 0, method: 'structured-field', confidence: 1 },
        { field: 'provider', value: repo, snapshotIndex: 0, method: 'structured-field', confidence: 0.9, text: flat(repo) },
        {
          field: 'category',
          value: guess.category,
          snapshotIndex: 0,
          method: guess.matched ? 'text-pattern' : 'absent',
          confidence: guess.matched ? 0.6 : 0,
          ...(guess.matched ? { text: guess.matched } : {})
        }
      ];

      // Very important for honesty: the bounty label is not a payout guarantee.
      established.push({
        field: 'rewardClaim',
        value: 'unverified',
        snapshotIndex: 0,
        method: 'structured-field',
        confidence: 0.9,
        text: flat(`labels=${labelNames.join(', ') || 'none'}; GitHub publishes no payout field`)
      });

      const publishedAt = toIso(issue.created_at);
      if (publishedAt) {
        established.push({
          field: 'publishedAt',
          value: publishedAt,
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.95,
          text: flat(String(issue.created_at ?? ''))
        });
      }

      if (issue.user?.login) {
        established.push({
          field: 'postedBy',
          value: issue.user.login,
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.9,
          text: flat(issue.user.login)
        });
      }

      if (labelNames.length) {
        established.push({
          field: 'skills',
          value: labelNames.join(', '),
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.35,
          text: flat(labelNames.join(', '))
        });
      }

      // Nothing here states pay, remote status, a CV requirement or a deadline.
      const unknownFields = [
        'reward.min',
        'reward.max',
        'reward.currency',
        'reward.basis',
        'remote',
        'directPay',
        'noCvRequired',
        'countries',
        'deadline',
        'paymentMethods'
      ];
      if (!labelNames.length) unknownFields.push('skills');

      // Bounties are open to anyone with a GitHub account unless stated otherwise.
      const directPay: Tri = 'unknown';

      candidates.push(
        makeCandidate({
          source,
          sourceItemId: itemId,
          title,
          provider: repo,
          category: guess.category,
          description: excerpt(bodyText, 4000),
          sourceUrl,
          discoveredAt: fetchedAt,
          publishedAt,
          reward: { min: null, max: null, currency: null, basis: 'unknown', raw: null },
          remote: 'unknown',
          directPay,
          noCvRequired: 'unknown',
          countries: [],
          eligibilityText: null,
          skills: labelNames,
          requirements: [],
          paymentMethods: [],
          deadline: null,
          competition,
          snapshots: [snapshot],
          established,
          unknownFields
        })
      );
    }

    return {
      sourceId: 'github-bounties',
      ok: true,
      httpStatus: http.status,
      error: null,
      bytes: http.bytes,
      candidates,
      itemsSeen: data.items.length,
      skipped,
      fetchedAt
    };
  }
};
