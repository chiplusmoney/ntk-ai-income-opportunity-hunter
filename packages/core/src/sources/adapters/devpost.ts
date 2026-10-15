import { parseRewardText } from '../../reward.js';
import type { Tri } from '../../types.js';
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
  type AdapterContext,
  type EstablishedField,
  type SourceAdapter,
  type SourceFetchResult
} from './shared.js';

/**
 * Devpost hackathon adapter.
 *
 * Verified 2026-10-14: 9 hackathons. `prize_amount` is an HTML fragment such as
 * `$<span data-currency-value>138,000</span>`; one live entry quoted INR
 * (`₹ <span data-currency-value>100,000</span>`), so the currency symbol and the
 * data-currency-value are parsed together and the raw string is retained.
 *
 * Competitions are hidden by default in V1 and this source is DISABLED in the
 * registry until Devpost terms are read (see SOURCE_REGISTRY.md).
 */

interface DevpostHackathon {
  id?: number | string;
  title?: string;
  url?: string;
  open_state?: string;
  displayed_location?: { icon?: string; location?: string };
  submission_period_dates?: string;
  themes?: { name?: string }[];
  prize_amount?: string | null;
  prizes_counts?: { cash?: number; other?: number };
  registrations_count?: number;
  organization_name?: string;
  invite_only?: boolean;
  time_left_to_submission?: string;
}

/**
 * Read an amount out of a Devpost prize fragment.
 * Returns the verbatim fragment as `raw`; the amount is only set when readable.
 */
export function parsePrizeAmount(fragment: string | null | undefined): {
  raw: string | null;
  min: number | null;
  max: number | null;
  currency: string | null;
} {
  if (!present(fragment)) return { raw: null, min: null, max: null, currency: null };

  const raw = fragment.replace(/\s+/g, ' ').trim();
  const dataValue = /data-currency-value[^>]*>\s*([\d.,]+)\s*</i.exec(raw)?.[1] ?? null;
  const parsed = parseRewardText(dataValue ? raw.replace(/<[^>]+>/g, ' ') : raw);

  return {
    raw,
    min: parsed.min,
    max: parsed.max,
    currency: parsed.currency
  };
}

/** "Aug 31 - Oct 23, 2026" -> ISO date of the closing day, when readable. */
export function parseSubmissionDeadline(period: string | null | undefined): string | null {
  if (!present(period)) return null;
  const parts = period.split(/\s+[–-]\s+/);
  const end = parts.length > 1 ? parts[parts.length - 1] : null;
  if (!end) return null;
  const parsed = Date.parse(`${end.trim()} 23:59:59 UTC`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export const devpostAdapter: SourceAdapter = {
  sourceId: 'devpost',
  description: 'Reads the public Devpost hackathon listing API (prize + submission window).',

  async run(ctx: AdapterContext): Promise<SourceFetchResult> {
    const source = getSource('devpost');
    const fetchedAt = ctx.now().toISOString();
    if (!source) return emptyResult('devpost', fetchedAt, 'Source missing from registry');

    const http = await getText(source.endpoint, {
      fetchImpl: ctx.fetchImpl,
      userAgent: ctx.userAgent,
      timeoutMs: ctx.timeoutMs
    });
    if (!http.ok) {
      return { ...emptyResult('devpost', fetchedAt, http.error ?? 'Request failed'), httpStatus: http.status, bytes: http.bytes };
    }

    const { data, error } = parseJson<{ hackathons?: DevpostHackathon[] }>(http.bodyText);
    if (!data || !Array.isArray(data.hackathons)) {
      return {
        ...emptyResult('devpost', fetchedAt, error ?? 'No hackathons array in response'),
        httpStatus: http.status,
        bytes: http.bytes
      };
    }

    const snapshot = await snapshotOf({
      source,
      sourceUrl: source.endpoint,
      fetchedAt,
      payload: http.bodyText,
      httpStatus: http.status
    });

    const candidates = [];
    const skipped: { reason: string; ref: string }[] = [];

    for (const hackathon of data.hackathons) {
      const itemId = hackathon.id === undefined || hackathon.id === null ? null : String(hackathon.id);
      const title = present(hackathon.title) ? hackathon.title.trim() : null;
      const sourceUrl = present(hackathon.url) ? hackathon.url.trim() : null;
      if (!itemId || !title || !sourceUrl) {
        skipped.push({ reason: 'Missing id, title or url', ref: itemId ?? title ?? '(unidentified hackathon)' });
        continue;
      }

      const themes = cleanList((hackathon.themes ?? []).map(t => t.name ?? null), 10);
      const locationText = present(hackathon.displayed_location?.location)
        ? hackathon.displayed_location.location.trim()
        : null;
      const online = locationText ? /^online$/i.test(locationText) : false;
      const remote: Tri = online ? true : 'unknown';

      const prize = parsePrizeAmount(hackathon.prize_amount);
      const deadline = parseSubmissionDeadline(hackathon.submission_period_dates);
      const cashPrizes = typeof hackathon.prizes_counts?.cash === 'number' ? hackathon.prizes_counts.cash : null;

      const established: EstablishedField[] = [
        { field: 'title', value: title, snapshotIndex: 0, method: 'structured-field', confidence: 1, text: flat(title) },
        { field: 'sourceUrl', value: sourceUrl, snapshotIndex: 0, method: 'structured-field', confidence: 1 },
        {
          field: 'category',
          value: 'Competition',
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.95,
          text: flat('Devpost hackathon listing')
        },
        // A hackathon prize is not payment for delivered work.
        {
          field: 'directPay',
          value: false,
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.9,
          text: flat('Reward is a competition prize, not a service fee')
        },
        {
          field: 'competition',
          value: true,
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.95,
          text: flat(String(hackathon.open_state ?? 'listed'))
        }
      ];

      const unknownFields: string[] = [];

      if (present(hackathon.organization_name)) {
        established.push({
          field: 'provider',
          value: hackathon.organization_name.trim(),
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.85,
          text: flat(hackathon.organization_name)
        });
      } else {
        unknownFields.push('provider');
      }

      if (prize.raw) {
        established.push({
          field: 'reward.raw',
          value: prize.raw,
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.95,
          text: flat(prize.raw)
        });
        if (prize.min !== null && prize.max !== null) {
          established.push(
            { field: 'reward.min', value: prize.min, snapshotIndex: 0, method: 'text-pattern', confidence: 0.8, text: flat(prize.raw) },
            { field: 'reward.max', value: prize.max, snapshotIndex: 0, method: 'text-pattern', confidence: 0.8, text: flat(prize.raw) }
          );
        } else {
          unknownFields.push('reward.min', 'reward.max');
        }
        if (prize.currency) {
          established.push({
            field: 'reward.currency',
            value: prize.currency,
            snapshotIndex: 0,
            method: 'text-pattern',
            confidence: 0.85,
            text: flat(prize.raw)
          });
        } else {
          unknownFields.push('reward.currency');
        }
        unknownFields.push('reward.basis');
      } else {
        unknownFields.push('reward.min', 'reward.max', 'reward.currency', 'reward.basis');
      }

      if (remote === true) {
        established.push({
          field: 'remote',
          value: true,
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.9,
          text: flat(locationText ?? '')
        });
      } else {
        unknownFields.push('remote');
      }

      if (deadline) {
        established.push({
          field: 'deadline',
          value: deadline,
          snapshotIndex: 0,
          method: 'text-pattern',
          confidence: 0.7,
          text: flat(hackathon.submission_period_dates ?? '')
        });
      } else {
        unknownFields.push('deadline');
      }

      if (cashPrizes !== null && cashPrizes > 0) {
        established.push({
          field: 'paymentMethods',
          value: 'cash prize',
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.8,
          text: flat(`prizes_counts.cash=${cashPrizes}`)
        });
        established.push({
          field: 'competitionScale',
          value: cashPrizes,
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.9,
          text: flat(`cash prize count ${cashPrizes}`)
        });
      } else {
        unknownFields.push('paymentMethods');
      }

      if (typeof hackathon.registrations_count === 'number') {
        established.push({
          field: 'registrations',
          value: hackathon.registrations_count,
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.9,
          text: flat(`registrations_count=${hackathon.registrations_count}`)
        });
      }

      if (themes.length) {
        established.push({
          field: 'skills',
          value: themes.join(', '),
          snapshotIndex: 0,
          method: 'structured-field',
          confidence: 0.5,
          text: flat(themes.join(', '))
        });
      } else {
        unknownFields.push('skills');
      }

      unknownFields.push('noCvRequired', 'countries');

      candidates.push(
        makeCandidate({
          source,
          sourceItemId: itemId,
          title,
          provider: present(hackathon.organization_name) ? hackathon.organization_name.trim() : null,
          category: 'Competition',
          description: flat(
            [
              present(hackathon.open_state) ? `State: ${hackathon.open_state}` : '',
              present(hackathon.submission_period_dates) ? `Submission window: ${hackathon.submission_period_dates}` : '',
              present(hackathon.time_left_to_submission) ? hackathon.time_left_to_submission : ''
            ]
              .filter(Boolean)
              .join(' · '),
            900
          ) || title,
          sourceUrl,
          discoveredAt: fetchedAt,
          publishedAt: null,
          reward: { min: prize.min, max: prize.max, currency: prize.currency, basis: 'one-off', raw: prize.raw },
          remote,
          directPay: false,
          noCvRequired: 'unknown',
          countries: [],
          eligibilityText: locationText,
          skills: themes,
          requirements: [],
          paymentMethods: cashPrizes !== null && cashPrizes > 0 ? ['cash prize'] : [],
          deadline,
          // A Devpost listing is competitive by definition.
          competition: true,
          snapshots: [snapshot],
          established,
          unknownFields
        })
      );
    }

    return {
      sourceId: 'devpost',
      ok: true,
      httpStatus: http.status,
      error: null,
      bytes: http.bytes,
      candidates,
      itemsSeen: data.hackathons.length,
      skipped,
      fetchedAt
    };
  }
};
