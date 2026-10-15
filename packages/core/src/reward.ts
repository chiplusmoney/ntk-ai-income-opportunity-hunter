import type { NormalizedReward } from './types.js';

/**
 * Reward parsing.
 *
 * Providers publish pay as free text with no schema. This module converts that
 * text into a normalized range WITHOUT inventing anything:
 *
 *  - The verbatim string is always retained in `raw`.
 *  - A value we cannot read stays `null` (unknown), never 0.
 *  - `basis` is only ever set from an explicit unit in the text. A plain
 *    "$170k - $200k" is NOT assumed to be annual, because the source never
 *    said so; it stays `unknown` and the scorer treats it conservatively.
 *
 * Shapes actually observed in the live feeds this was written against:
 *   ''                      (Remotive, salary not published)
 *   '$35,3k- $52k'          (European decimal comma + k suffix)
 *   'OTE $25k - $35k'       (prefixed qualifier)
 *   '$50-$75 /hour'         (hourly basis, sloppy spacing)
 *   '$20k -$35k'
 *   'Budget: €100 - €1000 EUR'  (Freelancer, currency symbol + code)
 */

const CURRENCY_BY_SYMBOL: Record<string, string> = {
  $: 'USD',
  '£': 'GBP',
  '€': 'EUR',
  '₹': 'INR',
  '₦': 'NGN',
  '¥': 'JPY',
  'C$': 'CAD',
  'A$': 'AUD'
};

const CURRENCY_CODES = ['USD', 'GBP', 'EUR', 'INR', 'NGN', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'PLN', 'ZAR'];

/** Explicitly stated pay periods, checked in order. */
const BASIS_PATTERNS: { re: RegExp; basis: NormalizedReward['basis'] }[] = [
  { re: /\/\s*(?:hr|hour)\b|\bper\s+hour\b|\ban\s+hour\b|\bhourly\b|\/\s*h\b/i, basis: 'hour' },
  { re: /\/\s*(?:day|day)\b|\bper\s+day\b|\bdaily\b|\ba\s+day\b/i, basis: 'day' },
  { re: /\/\s*(?:wk|week)\b|\bper\s+week\b|\bweekly\b|\ba\s+week\b/i, basis: 'week' },
  { re: /\/\s*(?:mo|month)\b|\bper\s+month\b|\bmonthly\b|\ba\s+month\b|\bpcm\b/i, basis: 'month' },
  {
    re: /\/\s*(?:yr|year)\b|\bper\s+(?:year|annum)\b|\bannually\b|\ba\s+year\b|\bp\.?a\.?\b|\bannual\b/i,
    basis: 'year'
  }
];

/**
 * Turn one numeric token into a number.
 *
 * Handles thousands separators and the European decimal-comma form that
 * Remotive actually emits ('$35,3k' means 35.3 thousand, not 353 thousand):
 * a comma followed by exactly one digit before a k/m suffix is a decimal point.
 */
export function parseNumericToken(rawAmount: string): number | null {
  const cleaned = rawAmount.replace(/\s/g, '');
  if (!cleaned) return null;

  const suffixMatch = /([km])$/i.exec(cleaned);
  const suffix = suffixMatch?.[1]?.toLowerCase() ?? null;
  const digits = suffix ? cleaned.slice(0, -1) : cleaned;
  if (!/^[\d.,]+$/.test(digits)) return null;

  let normalized: string;
  if (digits.includes(',') && digits.includes('.')) {
    // 1.234,56 (EU) or 1,234.56 (US): the last separator is the decimal one.
    const lastComma = digits.lastIndexOf(',');
    const lastDot = digits.lastIndexOf('.');
    normalized =
      lastComma > lastDot
        ? digits.replace(/\./g, '').replace(',', '.')
        : digits.replace(/,/g, '');
  } else if (digits.includes(',')) {
    const parts = digits.split(',');
    const rest = parts.slice(1).join('');
    // "35,3k" -> decimal comma; "100,000" -> thousands separator.
    normalized = rest.length === 1 && suffix ? `${parts[0]}.${rest}` : parts.join('');
  } else {
    normalized = digits;
  }

  const value = Number.parseFloat(normalized);
  if (!Number.isFinite(value)) return null;

  if (suffix === 'k') return value * 1_000;
  if (suffix === 'm') return value * 1_000_000;
  return value;
}

/** Detect a currency from a symbol or explicit code. Returns null when absent. */
export function detectCurrency(text: string): string | null {
  for (const [symbol, code] of Object.entries(CURRENCY_BY_SYMBOL)) {
    if (text.includes(symbol)) return code;
  }
  const code = new RegExp(`\\b(${CURRENCY_CODES.join('|')})\\b`, 'i').exec(text);
  return code?.[1] ? code[1].toUpperCase() : null;
}

/**
 * Extract the currency amount tokens from a reward string.
 *
 * Deliberately narrow: a token only counts when it is attached to a currency
 * marker (symbol or ISO code), so "2-3 years experience" is never read as pay.
 */
function extractAmounts(text: string): number[] {
  const amounts: number[] = [];
  // Collapse whitespace first: HTML-stripped fragments really do arrive as
  // "₹  100,000" (double space), which a single-char separator would miss.
  const haystack = text.replace(/\s+/g, ' ');
  const moneyRe =
    /(?:[$£€₹₦¥]|C\$|A\$|\b(?:USD|GBP|EUR|INR|NGN|CAD|AUD|JPY|CHF|SEK|PLN|ZAR)\b)\s*(\d[\d.,]*\s?[km]?)/gi;
  let m: RegExpExecArray | null;
  while ((m = moneyRe.exec(haystack)) !== null) {
    const amountText = m[1];
    if (!amountText) continue;
    const value = parseNumericToken(amountText);
    if (value !== null && value > 0) amounts.push(value);
  }
  return amounts;
}

export interface RewardParseOptions {
  /**
   * Currency to assume when the text carries an amount but no currency marker.
   * Only pass this when the source is documented as single-currency; otherwise
   * leave it undefined and the currency stays `null` (unknown).
   */
  defaultCurrency?: string;
}

export function parseRewardText(
  raw: string | null | undefined,
  options: RewardParseOptions = {}
): NormalizedReward {
  const original = typeof raw === 'string' ? raw.trim() : '';
  if (!original) {
    return { min: null, max: null, currency: null, basis: 'unknown', raw: null };
  }

  const amounts = extractAmounts(original);
  const currency = detectCurrency(original) ?? (amounts.length > 0 ? (options.defaultCurrency ?? null) : null);
  const basis = BASIS_PATTERNS.find(p => p.re.test(original))?.basis ?? 'unknown';

  if (amounts.length === 0) {
    // Reward text exists but carries no readable amount: unknown, not zero.
    return { min: null, max: null, currency, basis, raw: original };
  }

  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  return { min, max, currency, basis, raw: original };
}

/** Currency codes treated as USD-equivalent. No FX conversion is ever invented. */
export function isUsd(currency: string | null): boolean {
  return currency === null || currency === 'USD';
}

/**
 * Normalize a reward to an approximate hourly figure for ranking only.
 *
 * This is a product comparison, not a claim about the posting, so the
 * assumptions are explicit and fixed:
 *   hour  -> as stated
 *   day   -> x8 hours
 *   week  -> x40 hours
 *   month -> x160 hours
 *   year  -> /2000 hours
 *   one-off / unknown -> the low end is treated as a single payment, capped
 *                        separately by the scorer; never treated as an hourly rate.
 *
 * Returns null when there is no readable amount or the currency is not USD
 * (converting would require an FX rate we have no evidence for).
 */
export function toHourlyEquivalent(reward: NormalizedReward): number | null {
  const amount = reward.min ?? reward.max;
  if (amount === null) return null;
  if (!isUsd(reward.currency)) return null;

  switch (reward.basis) {
    case 'hour':
      return amount;
    case 'day':
      return amount / 8;
    case 'week':
      return amount / 40;
    case 'month':
      return amount / 160;
    case 'year':
      return amount / 2000;
    default:
      return null;
  }
}

/** Hours the stated amount is intended to cover. Used to size one-off payments. */
export function rewardBasisHours(basis: NormalizedReward['basis']): number | null {
  switch (basis) {
    case 'hour':
      return 1;
    case 'day':
      return 8;
    case 'week':
      return 40;
    case 'month':
      return 160;
    case 'year':
      return 2000;
    default:
      return null;
  }
}

export const __internal = { extractAmounts, BASIS_PATTERNS };
