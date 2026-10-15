import { htmlToText, excerpt } from '../../evidence/index.js';
import type { Tri } from '../../types.js';
import { getSource } from '../registry.js';
import { getText, parseJson } from '../http.js';
import { inferCategory } from '../category.js';
import {
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
 * Hacker News freelancer-thread adapter (via the Algolia HN Search API).
 *
 * Verified 2026-10-14: 20 hits with title, url, created_at, objectID, points,
 * author. Nothing here states pay, so `reward` and `directPay` stay unknown and
 * confidence is capped by the risk model.
 *
 * The link always points at the Hacker News item page, never at the search API
 * URL, so a reader can verify the claim in context.
 *
 * This adapter is implemented but the source is DISABLED in the registry: the
 * provider terms page is client-rendered and no permitted-use statement could be
 * established (see SOURCE_REGISTRY.md).
 */

interface HnHit {
  objectID?: string;
  title?: string | null;
  story_title?: string | null;
  url?: string | null;
  story_text?: string | null;
  author?: string;
  created_at?: string;
  points?: number;
  num_comments?: number;
  _tags?: string[];
}

export const hnFreelancerAdapter: SourceAdapter = {
  sourceId: 'hn-freelancer',
  description: 'Reads public Hacker News story metadata through the Algolia HN search API.',

  async run(ctx: AdapterContext): Promise<SourceFetchResult> {
    const source = getSource('hn-freelancer');
    const fetchedAt = ctx.now().toISOString();
    if (!source) return emptyResult('hn-freelancer', fetchedAt, 'Source missing from registry');

    const url = `${source.endpoint}?query=freelancer&tags=story`;
    const http = await getText(url, {
      fetchImpl: ctx.fetchImpl,
      userAgent: ctx.userAgent,
      timeoutMs: ctx.timeoutMs
    });
    if (!http.ok) {
      return { ...emptyResult('hn-freelancer', fetchedAt, http.error ?? 'Request failed'), httpStatus: http.status, bytes: http.bytes };
    }

    const { data, error } = parseJson<{ hits?: HnHit[] }>(http.bodyText);
    if (!data || !Array.isArray(data.hits)) {
      return {
        ...emptyResult('hn-freelancer', fetchedAt, error ?? 'No hits array in response'),
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

    for (const hit of data.hits) {
      const itemId = present(hit.objectID) ? hit.objectID.trim() : null;
      const title = present(hit.title ?? '') ? (hit.title as string).trim() : present(hit.story_title ?? '') ? (hit.story_title as string).trim() : null;
      if (!itemId || !title) {
        skipped.push({ reason: 'Missing objectID or title', ref: itemId ?? '(unidentified hit)' });
        continue;
      }

      const discussionUrl = `https://news.ycombinator.com/item?id=${itemId}`;
      const storyText = present(hit.story_text ?? '') ? htmlToText(hit.story_text as string) : '';
      const guess = inferCategory(`${title} ${storyText}`);

      const established: EstablishedField[] = [
        { field: 'title', value: title, snapshotIndex: 0, method: 'structured-field', confidence: 1, text: flat(title) },
        {
          field: 'discussionUrl',
          value: discussionUrl,
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 1,
          text: flat(discussionUrl)
        },
        {
          field: 'category',
          value: guess.category,
          snapshotIndex: 0,
          method: guess.matched ? 'text-pattern' : 'absent',
          confidence: guess.matched ? 0.55 : 0,
          ...(guess.matched ? { text: guess.matched } : {})
        }
      ];

      const unknownFields = [
        'provider',
        'reward.min',
        'reward.max',
        'reward.currency',
        'reward.basis',
        'remote',
        'directPay',
        'noCvRequired',
        'countries',
        'deadline',
        'paymentMethods',
        'skills'
      ];

      if (present(hit.author ?? '')) {
        established.push({
          field: 'postedBy',
          value: hit.author as string,
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.9,
          text: flat(hit.author as string)
        });
      }

      const publishedAt = toIso(hit.created_at);
      if (publishedAt) {
        established.push({
          field: 'publishedAt',
          value: publishedAt,
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.9,
          text: flat(String(hit.created_at ?? ''))
        });
      } else {
        unknownFields.push('publishedAt');
      }

      if (typeof hit.points === 'number') {
        established.push({
          field: 'points',
          value: hit.points,
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.9,
          text: flat(`points=${hit.points}`)
        });
      }

      const directPay: Tri = 'unknown';

      candidates.push(
        makeCandidate({
          source,
          sourceItemId: itemId,
          title,
          provider: null,
          category: guess.category,
          description: storyText ? excerpt(storyText, 2000) : title,
          sourceUrl: discussionUrl,
          discoveredAt: fetchedAt,
          publishedAt,
          reward: { min: null, max: null, currency: null, basis: 'unknown', raw: null },
          remote: 'unknown',
          directPay,
          noCvRequired: 'unknown',
          countries: [],
          eligibilityText: null,
          skills: [],
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
      sourceId: 'hn-freelancer',
      ok: true,
      httpStatus: http.status,
      error: null,
      bytes: http.bytes,
      candidates,
      itemsSeen: data.hits.length,
      skipped,
      fetchedAt
    };
  }
};
