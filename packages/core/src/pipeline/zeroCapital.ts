import type { CapitalStatus, EvidenceAssertion, ZeroCapitalAssessment } from '../types.js';

/**
 * Zero-capital filtering.
 *
 * The product promise is "no money up front". This module separates two states
 * that are easy to conflate:
 *
 *  1. NO COST EVIDENCE FOUND (`zeroCapital: true`, `upfrontCostUsd: null`)
 *     The posting never mentions a fee. It is not rejected, but it is NOT
 *     reported as confirmed free either — the source never said so.
 *  2. POSITIVELY FREE (`zeroCapital: true`, `costConfirmed: true`,
 *     `upfrontCostUsd: 0`)
 *     The source states there is no up-front payment.
 *
 * Any stated up-front cost defeats the promise outright (`zeroCapital: false`),
 * even when it is wrapped in "free to join" copy. Severity `warn` signals are
 * surfaced without affecting the verdict.
 */

export interface CostSignal {
  /** Text that triggered the match. */
  text: string;
  /** Money the applicant would have to pay, when the pattern yields an amount. */
  amountUsd: number | null;
  /** How serious the signal is for the zero-capital promise. */
  severity: 'blocking' | 'cost' | 'warn';
  /** Short explanation shown in the UI. */
  note: string;
}

/**
 * Patterns are intentionally specific. Requiring an explicit payment verb or a
 * fee noun avoids flagging ordinary prose such as "no fee" or "we pay you".
 */
const FEE_PATTERNS: { re: RegExp; severity: CostSignal['severity']; note: string; amountGroup?: number }[] = [
  {
    re: /\b(?:registration|sign[- ]?up|joining|membership|enrol{1,2}ment|enrollment)\s+(?:fee|charge|cost)\b[^.]{0,60}/gi,
    severity: 'blocking',
    note: 'Registration or membership fee mentioned.'
  },
  {
    re: /\bpay\s+(?:a\s+|an\s+|the\s+|us\s+|them\s+)?(?:registration|sign[- ]?up|joining|membership|enrol{1,2}ment|enrollment|application|training|onboarding|setup|activation)\s*(?:fee|charge|cost)?\b[^.]{0,60}/gi,
    severity: 'blocking',
    note: 'A payment is requested from the applicant before work.'
  },
  {
    re: /\b(?:training|onboarding|equipment|kit|starter|software|licen[cs]e)\s+(?:fee|charge|cost|purchase)\b[^.]{0,60}/gi,
    severity: 'blocking',
    note: 'A paid training, kit or software requirement is stated.'
  },
  {
    re: /\bsecurity\s+deposit\b[^.]{0,60}/gi,
    severity: 'blocking',
    note: 'Security deposit requested.'
  },
  {
    re: /\brefundable\s+(?:deposit|fee)\b[^.]{0,60}/gi,
    severity: 'blocking',
    note: 'Refundable deposit requested; still an up-front outlay.'
  },
  {
    re: /\b(?:buy|purchase|stake|staking|lock(?:ing)?\s+up)\b[^.]{0,40}\b(?:token|tokens|coin|coins|crypto|nft|nfts)\b[^.]{0,60}/gi,
    severity: 'blocking',
    note: 'Token purchase or staking is required; V1 forbids capital-at-risk.'
  },
  {
    re: /\b(?:gas\s*fees?|mint\s+fees?)\b[^.]{0,60}/gi,
    severity: 'blocking',
    note: 'On-chain gas or minting cost required.'
  },
  {
    re: /(?:^|[^\w])[$£€]\s?\d[\d,]*(?:\.\d+)?[^.]{0,50}\b(?:to\s+)?(?:start|begin|apply|join|get\s+started)\b/gi,
    severity: 'blocking',
    note: 'An amount is quoted as needed to start or apply.'
  },
  {
    re: /\bpaid\s+(?:course|training\s+program(?:me)?|certification\s+program(?:me)?)\b[^.]{0,60}/gi,
    severity: 'cost',
    note: 'Paid course or certification programme mentioned.'
  },
  {
    re: /\bminim(?:um|al)\s+(?:deposit|balance|capital)\b[^.]{0,60}/gi,
    severity: 'cost',
    note: 'Minimum deposit or capital balance mentioned.'
  }
];

/** Explicit denials of cost, used to strengthen a positive zero-capital claim. */
const NO_COST_PATTERNS: RegExp[] = [
  /\bno\s+(?:fee|fees|cost|costs|charge|charges|investment|deposit|equipment\s+purchase)\b[^.]{0,80}/gi,
  /\b(?:free|at\s+no\s+cost|zero[- ]cost|100%\s+free)\b[^.]{0,80}/gi,
  /\bno\s+(?:upfront|up[- ]front|out[- ]of[- ]pocket)\s+(?:payment|cost|fee|fees|money)\b[^.]{0,80}/gi,
  /\bwe\s+(?:provide|supply|ship)\s+(?:all\s+)?(?:the\s+)?(?:equipment|device|kit|hardware|software\s+licen[cs]e)\b[^.]{0,80}/gi
];

/** Terms implying outlay that are risky but not automatically disqualifying. */
function detectCostSignals(description: string, extra = ''): CostSignal[] {
  const haystack = `${description} ${extra}`.replace(/\s+/g, ' ');
  const signals: CostSignal[] = [];
  const seen = new Set<string>();

  // Skip a match when the surrounding clause is a negation ("no registration fee").
  const negated = (match: string, index: number) => {
    const window = haystack.slice(Math.max(0, index - 60), index);
    return /\b(no|never|without|zero|not|isn't|is not|won't)\b[^.]{0,30}$/i.test(window) || /\bno\b/i.test(match.slice(0, 12));
  };

  for (const pattern of FEE_PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(haystack)) !== null) {
      const text = m[0].trim();
      if (negated(text, m.index)) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      signals.push({
        text,
        amountUsd: extractAmount(text),
        severity: pattern.severity,
        note: pattern.note
      });
      if (signals.length > 20) return signals;
    }
  }

  return signals;
}

/** Parse a leading currency amount from a snippet, USD-normalised when obvious. */
export function extractAmount(text: string): number | null {
  const m = /(?:[$£€]\s?(\d[\d,]*(?:\.\d+)?))|(?:(\d[\d,]*(?:\.\d+)?)\s?(?:usd|dollars?))/i.exec(text);
  if (!m) return null;
  const raw = (m[1] ?? m[2] ?? '').replace(/,/g, '');
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : null;
}

function detectNoCostStatements(description: string, extra = ''): string[] {
  const haystack = `${description} ${extra}`.replace(/\s+/g, ' ');
  const hits: string[] = [];
  for (const re of NO_COST_PATTERNS) {
    const scan = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = scan.exec(haystack)) !== null) {
      const text = m[0].trim();
      if (text && !hits.includes(text)) hits.push(text);
      if (hits.length > 10) return hits;
    }
  }
  return hits;
}

export function assessZeroCapital(params: {
  description: string;
  additionalText?: string;
  assertions?: EvidenceAssertion[];
}): ZeroCapitalAssessment {
  const { description, additionalText = '', assertions = [] } = params;

  const costSignals = detectCostSignals(description, additionalText);
  const noCostStatements = detectNoCostStatements(description, additionalText);

  const establishedByAssertion = assertions.some(
    a => a.field === 'noCapitalRequired' && a.value === true && a.method !== 'absent'
  );

  const blocking = costSignals.filter(s => s.severity === 'blocking');
  const costs = costSignals.filter(s => s.severity === 'cost');
  const warns = costSignals.filter(s => s.severity === 'warn');

  const explicitCosts = [...blocking, ...costs];
  const knownAmount = explicitCosts
    .map(s => s.amountUsd)
    .filter((n): n is number => n !== null)
    .reduce((a, b) => (b > a ? b : a), 0);

  const hasPositiveSignal = establishedByAssertion || noCostStatements.length > 0;

  // A stated up-front cost always defeats the promise, even alongside "free to join" copy.
  const zeroCapital = explicitCosts.length === 0;
  const costConfirmed = zeroCapital && hasPositiveSignal;

  // The single field a user-facing surface may rely on.
  const status: CapitalStatus = !zeroCapital
    ? 'capital_required'
    : costConfirmed
      ? 'confirmed_free'
      : 'unconfirmed_no_cost_found';

  const signals: string[] = [];
  if (establishedByAssertion) signals.push('Source states no upfront payment is required.');
  if (noCostStatements.length) signals.push(`No-cost statements: ${noCostStatements.length}`);
  if (blocking.length) signals.push(`Blocking cost signals: ${blocking.length}`);
  if (costs.length) signals.push(`Cost signals: ${costs.length}`);
  if (warns.length) signals.push(`Advisory note: ${warns.length}`);
  if (!hasPositiveSignal && !explicitCosts.length) {
    signals.push('No explicit zero-capital statement; cost state is unconfirmed.');
  }

  const evidence: string[] = [
    ...(establishedByAssertion ? ['assertion:noCapitalRequired=true'] : []),
    ...noCostStatements.map(s => `no-cost: ${s}`),
    ...costSignals.map(s => `cost(${s.severity}): ${s.text}`)
  ];

  return {
    zeroCapital,
    status,
    costConfirmed,
    // Distinguish "the source said $0" from "nothing was said about cost".
    upfrontCostUsd: zeroCapital ? (costConfirmed ? 0 : null) : (knownAmount || null),
    signals,
    evidence: evidence.slice(0, 20)
  };
}

/** Exposed for tests and for the risk engine, which reuses the same signals. */
export const __internal = { detectCostSignals, detectNoCostStatements, FEE_PATTERNS, NO_COST_PATTERNS };
