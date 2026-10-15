import { htmlToText } from '../../evidence/index.js';
import { parseRewardText } from '../../reward.js';
import type { NormalizedReward, Tri } from '../../types.js';
import { getSource } from '../registry.js';
import { getText } from '../http.js';
import { inferCategory } from '../category.js';
import { parseRss } from './rss.js';
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
 * Freelancer.com "New Projects" RSS adapter.
 *
 * Verified 2026-10-14: 20 items, every one carrying a title, a canonical
 * project link and an embedded "(Budget: €100 - €1000 EUR, Jobs: ...)" clause.
 * The budget clause is real published data, so the reward is derived from it as
 * a `text-pattern` rather than left unknown.
 *
 * This adapter is implemented but the source is DISABLED in the registry until
 * Freelancer's terms are read (see SOURCE_REGISTRY.md).
 */

/** Pull the budget and skills clauses out of a Freelancer description. */
export function parseBudgetClause(description: string | null): {
  reward: NormalizedReward;
  skills: string[];
  matched: boolean;
} {
  const text = description ?? '';
  const budget = /Budget:\s*([^)]+)/i.exec(text)?.[1]?.trim() ?? null;
  const jobs = /Jobs:\s*([^)]+)/i.exec(text)?.[1]?.trim() ?? null;

  return {
    reward: parseRewardText(budget),
    skills: jobs ? cleanList(jobs.split(','), 20) : [],
    matched: budget !== null
  };
}

/** Strip the " (Budget: ...)" trailer that the feed repeats in the description. */
function headlineOf(description: string | null): string {
  if (!description) return '';
  const cut = description.split(/\s*\(Budget:/i)[0] ?? description;
  return htmlToText(cut.replace(/\.\.\.$/, '')).trim();
}

export const freelancerRssAdapter: SourceAdapter = {
  sourceId: 'freelancer-rss',
  description: 'Reads the public Freelancer.com projects RSS feed (title + embedded budget clause).',

  async run(ctx: AdapterContext): Promise<SourceFetchResult> {
    const source = getSource('freelancer-rss');
    const fetchedAt = ctx.now().toISOString();
    if (!source) return emptyResult('freelancer-rss', fetchedAt, 'Source missing from registry');

    const http = await getText(source.endpoint, {
      fetchImpl: ctx.fetchImpl,
      userAgent: ctx.userAgent,
      timeoutMs: ctx.timeoutMs
    });
    if (!http.ok) {
      return {
        ...emptyResult('freelancer-rss', fetchedAt, http.error ?? 'Request failed'),
        httpStatus: http.status,
        bytes: http.bytes
      };
    }

    const channel = parseRss(http.bodyText, 100);
    const snapshot = await snapshotOf({
      source,
      sourceUrl: source.endpoint,
      fetchedAt,
      payload: http.bodyText,
      httpStatus: http.status
    });

    const candidates = [];
    const skipped: { reason: string; ref: string }[] = [];

    for (const item of channel.items) {
      const link = present(item.link) ? item.link.trim() : null;
      const title = present(item.title) ? item.title.trim() : null;
      if (!link || !title) {
        skipped.push({ reason: 'Missing title or link', ref: link ?? title ?? '(unidentified item)' });
        continue;
      }

      // guid is "Freelancer_project_<id>"; the project id is stable.
      const itemId = present(item.guid)
        ? (item.guid.replace(/^Freelancer_project_/i, '').trim() || link)
        : link;

      const description = present(item.description) ? item.description : null;
      const { reward, skills, matched } = parseBudgetClause(description);
      const headline = headlineOf(description);
      const guess = inferCategory(`${title} ${headline} ${skills.join(' ')}`);

      const established: EstablishedField[] = [
        { field: 'title', value: title, snapshotIndex: 0, method: 'structured-field', confidence: 1, text: flat(title) },
        { field: 'sourceUrl', value: link, snapshotIndex: 0, method: 'structured-field', confidence: 1 },
        {
          // The feed publishes no client identity; the platform is the payer intermediary.
          field: 'provider',
          value: 'Freelancer.com',
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.6,
          text: flat('Feed publisher: Freelancer.com')
        },
        {
          field: 'category',
          value: guess.category,
          snapshotIndex: 0,
          method: guess.matched ? 'text-pattern' : 'absent',
          confidence: guess.matched ? 0.6 : 0,
          ...(guess.matched ? { text: guess.matched } : {})
        }
      ];

      const unknownFields: string[] = [];

      if (matched && reward.raw) {
        established.push({
          field: 'reward.raw',
          value: reward.raw,
          snapshotIndex: 0,
          method: 'text-pattern',
          confidence: 0.85,
          text: flat(reward.raw)
        });
        if (reward.min !== null && reward.max !== null) {
          established.push(
            { field: 'reward.min', value: reward.min, snapshotIndex: 0, method: 'text-pattern', confidence: 0.8, text: flat(reward.raw) },
            { field: 'reward.max', value: reward.max, snapshotIndex: 0, method: 'text-pattern', confidence: 0.8, text: flat(reward.raw) }
          );
        } else {
          unknownFields.push('reward.min', 'reward.max');
        }
        if (reward.currency) {
          established.push({
            field: 'reward.currency',
            value: reward.currency,
            snapshotIndex: 0,
            method: 'text-pattern',
            confidence: 0.85,
            text: flat(reward.raw)
          });
        } else {
          unknownFields.push('reward.currency');
        }
        // The RSS budget is a project total; no period is stated.
        unknownFields.push('reward.basis');
      } else {
        unknownFields.push('reward.min', 'reward.max', 'reward.currency', 'reward.basis');
      }

      const publishedAt = toIso(item.pubDate);
      if (publishedAt) {
        established.push({
          field: 'publishedAt',
          value: publishedAt,
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.9,
          text: flat(item.pubDate ?? '')
        });
      } else {
        unknownFields.push('publishedAt');
      }

      // A published project budget is the platform stating pay for delivered work.
      const directPay: Tri = matched ? true : 'unknown';
      if (directPay === true) {
        established.push({
          field: 'directPay',
          value: true,
          snapshotIndex: 0,
          method: 'text-pattern',
          confidence: 0.85,
          text: flat(reward.raw ?? '')
        });
      } else {
        unknownFields.push('directPay');
      }

      if (skills.length) {
        established.push({
          field: 'skills',
          value: skills.join(', '),
          snapshotIndex: 0,
          method: 'text-pattern',
          confidence: 0.7,
          text: flat(skills.join(', '))
        });
      } else {
        unknownFields.push('skills');
      }

      unknownFields.push('remote', 'noCvRequired', 'countries', 'deadline', 'paymentMethods');

      candidates.push(
        makeCandidate({
          source,
          sourceItemId: itemId,
          title,
          provider: 'Freelancer.com',
          category: guess.category,
          description: headline || title,
          sourceUrl: link,
          discoveredAt: fetchedAt,
          publishedAt,
          reward,
          remote: 'unknown',
          directPay,
          noCvRequired: 'unknown',
          countries: [],
          eligibilityText: null,
          skills,
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
      sourceId: 'freelancer-rss',
      ok: true,
      httpStatus: http.status,
      error: null,
      bytes: http.bytes,
      candidates,
      itemsSeen: channel.items.length,
      skipped,
      fetchedAt
    };
  }
};
