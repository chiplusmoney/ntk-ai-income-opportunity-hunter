import type { EvidenceAssertion, RiskAssessment, RiskFinding, RiskLevel, Tri } from '../types.js';
import { extractAmount } from './zeroCapital.js';

/**
 * Risk / scam detection.
 *
 * Deterministic pattern rules only. This stage is the reason the product can
 * claim "AI explains, it does not invent": a candidate that trips a hard rule
 * is withheld before any model sees it.
 *
 * Scoring starts at 100 and subtracts fixed penalties, so the trust score is
 * reproducible and every point lost has a named cause.
 */

const BASE_TRUST = 100;

interface RiskRule {
  code: string;
  level: RiskLevel;
  penalty: number;
  /** Applies to the combined searchable text (title + description + extra). */
  test: (ctx: RiskContext) => RiskFinding | null;
}

interface RiskContext {
  title: string;
  provider: string;
  description: string;
  text: string;
  sourceReliability: number;
  directPay: Tri;
  remote: Tri;
  rewardMin: number | null;
  rewardMax: number | null;
  rewardBasis: string | null;
  sourceUrl: string;
  publishedAt: string | null;
  assertions: EvidenceAssertion[];
}

function finding(code: string, level: RiskLevel, penalty: number, message: string, evidence: string): RiskFinding {
  return { code, level, penalty, message, evidence: evidence.slice(0, 200) };
}

/** Match helper returning the first hit with its surrounding clause. */
function hit(text: string, re: RegExp, window = 90): string | null {
  const scan = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  const m = scan.exec(text);
  if (!m) return null;
  const start = Math.max(0, m.index - 20);
  return text.slice(start, Math.min(text.length, m.index + m[0].length + window)).trim();
}

const RULES: RiskRule[] = [
  {
    code: 'upfront_payment_request',
    level: 'critical',
    penalty: 100,
    test: ctx => {
      // Three ways a posting can ask the applicant for money. All are critical:
      // the V1 promise is that nothing is paid up front, ever.
      const verbForm =
        hit(ctx.text, /\b(?:pay|send|transfer|remit)\s+(?:us\s+|them\s+|me\s+)?(?:a\s+|an\s+|the\s+)?(?:fee|deposit|money|payment|charge)\b/i) ??
        hit(ctx.text, /\b(?:pay|send|transfer|remit)\b[^.]{0,30}(?:[$£€₹₦]\s?\d[\d,]*|\d[\d,]*\s?(?:usd|dollars?))/i);
      const nounForm = hit(
        ctx.text,
        /\b(?:security|refundable|registration|sign[- ]?up|joining|application|membership|enrol{1,2}ment|activation|processing|training|onboarding|equipment|kit)\s+(?:fee|fees|deposit|charge|bond|cost|payment)\b/i
      );
      const amountForm = hit(
        ctx.text,
        /\b(?:fee|deposit|charge|bond)\b\s+(?:of|is|:)?\s*(?:[$£€₹₦]\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*\s?(?:usd|dollars?))/i
      );
      const snippet = verbForm ?? nounForm ?? amountForm;
      return snippet
        ? finding('upfront_payment_request', 'critical', 100,
            'Applicant is asked to pay money before earning.', snippet)
        : null;
    }
  },
  {
    code: 'crypto_capital_at_risk',
    level: 'critical',
    penalty: 100,
    test: ctx => {
      const snippet =
        hit(ctx.text, /\b(?:send|deposit|stake|lock)\b[^.]{0,30}\b(?:eth|btc|usdt|usdc|sol|bnb|token|coins?|crypto)\b/i) ??
        hit(ctx.text, /\bseed\s+phrase\b|\bprivate\s+key\b|\bmnemonic\b/i);
      return snippet ? finding('crypto_capital_at_risk', 'critical', 100,
        'Requires wallet funds, staking or wallet secrets; forbidden in V1.', snippet) : null;
    }
  },
  {
    code: 'guaranteed_income_claim',
    level: 'high',
    penalty: 30,
    test: ctx => {
      const snippet = hit(
        ctx.text,
        /\b(?:guaranteed|assured|risk[- ]free)\b[^.]{0,40}\b(?:income|earnings?|profit|returns?|money|salary)\b/i
      ) ?? hit(ctx.text, /\b(?:earn|make)\b[^.]{0,25}\b(?:up\s+to\s+)?[$£€]\s?\d[\d,]*\s*(?:per|\/)\s*(?:day|week)\b/i);
      return snippet ? finding('guaranteed_income_claim', 'high', 30,
        'Unrealistic or guaranteed-income language is a common scam marker.', snippet) : null;
    }
  },
  {
    code: 'telegram_whatsapp_contact_only',
    level: 'medium',
    penalty: 12,
    test: ctx => {
      const snippet =
        hit(ctx.text, /\b(?:contact|reach|message|dm|apply)\b[^.]{0,40}\b(?:on\s+)?(?:whatsapp|telegram)\b/i) ??
        hit(ctx.text, /\b(?:telegram|whatsapp)\b[^.]{0,30}(?:t\.me|wa\.me|chat)\b/i);
      return snippet ? finding('telegram_whatsapp_contact_only', 'medium', 12,
        'Off-platform messaging contact; reduces verifiability of stated terms.', snippet) : null;
    }
  },
  {
    code: 'unverifiable_communication',
    level: 'medium',
    penalty: 10,
    test: ctx => {
      const snippet = hit(ctx.text, /\b(?:gmail|yahoo|hotmail|outlook)\s*\.\s*com\b/i);
      return snippet ? finding('unverifiable_communication', 'medium', 10,
        'Free personal email used as the only business contact.', snippet) : null;
    }
  },
  {
    code: 'unrealistic_pay_for_effort',
    level: 'high',
    penalty: 22,
    test: ctx => {
      const snippet = hit(ctx.text, /[$£€]\s?\d[\d,]*(?:\.\d+)?\s*(?:per|\/|a\s+)\s*(?:minute|min\b)/i);
      if (snippet) {
        return finding('unrealistic_pay_for_effort', 'high', 22,
          'Pay stated per minute of work is not a credible rate.', snippet);
      }
      // Very large "per task" amounts on generic microtask wording.
      const big = hit(ctx.text, /[$£€]\s?[1-9]\d{3,}[^.]{0,40}\bper\s+(?:task|click|survey|review)\b/i);
      return big ? finding('unrealistic_pay_for_effort', 'high', 22,
        'Disproportionate pay quoted for a single simple task.', big) : null;
    }
  },
  {
    code: 'no_verifiable_source',
    level: 'medium',
    penalty: 14,
    test: ctx => {
      if (!ctx.sourceUrl || !/^https?:\/\//i.test(ctx.sourceUrl)) {
        return finding('no_verifiable_source', 'medium', 14,
          'Posting cannot be traced to a public, verifiable URL.', ctx.sourceUrl || '(missing)');
      }
      return null;
    }
  },
  {
    code: 'low_reliability_source',
    level: 'low',
    penalty: 8,
    test: ctx => (ctx.sourceReliability < 70
      ? finding('low_reliability_source', 'low', 8,
          'Source has a below-average reliability baseline; claims need corroboration.',
          `sourceReliability=${ctx.sourceReliability}`)
      : null)
  },
  {
    code: 'direct_pay_unconfirmed',
    level: 'low',
    penalty: 8,
    test: ctx => (ctx.directPay === 'unknown'
      ? finding('direct_pay_unconfirmed', 'low', 8,
          'Payment route is not stated in the source; direct pay remains unconfirmed.',
          'directPay=unknown')
      : null)
  },
  {
    code: 'reward_not_published',
    level: 'low',
    penalty: 6,
    test: ctx => (ctx.rewardMin === null && ctx.rewardMax === null
      ? finding('reward_not_published', 'low', 6,
          'No reward amount published; earning value cannot be assessed from evidence.',
          'reward=unknown')
      : null)
  },
  {
    code: 'unpaid_trial_risk',
    level: 'medium',
    penalty: 15,
    test: ctx => {
      const snippet =
        hit(ctx.text, /\b(?:unpaid|free)\s+(?:trial|test\s+task|sample\s+task|trial\s+task)\b/i) ??
        hit(ctx.text, /\b(?:complete|do)\s+(?:a\s+)?test\s+task\b[^.]{0,40}\bunpaid\b/i);
      return snippet ? finding('unpaid_trial_risk', 'medium', 15,
        'Unpaid trial or spec work requested before any agreement.', snippet) : null;
    }
  },
  {
    code: 'vague_scope_no_deliverable',
    level: 'low',
    penalty: 6,
    test: ctx => {
      const words = ctx.description.trim().split(/\s+/).filter(Boolean).length;
      if (words > 0 && words < 25 && !/\b(?:deliverable|milestone|scope|requirement)\b/i.test(ctx.text)) {
        return finding('vague_scope_no_deliverable', 'low', 6,
          'Very short posting with no stated deliverable or scope.', `${words} words`);
      }
      return null;
    }
  },
  {
    code: 'stale_listing',
    level: 'low',
    penalty: 5,
    test: ctx => {
      if (!ctx.publishedAt) return null;
      const published = Date.parse(ctx.publishedAt);
      if (!Number.isFinite(published)) return null;
      const ageDays = (Date.now() - published) / 86_400_000;
      return ageDays > 120
        ? finding('stale_listing', 'low', 5, 'Listing is more than 120 days old and may be closed.',
            `${Math.round(ageDays)} days old`)
        : null;
    }
  },
  {
    code: 'prize_not_salary',
    level: 'medium',
    penalty: 10,
    test: ctx => {
      const snippet = hit(ctx.text, /\b(?:prize|prize\s+pool|jackpot|grand\s+prize)\b/i);
      return snippet ? finding('prize_not_salary', 'medium', 10,
        'Reward is a competition prize, not payment for delivered work.', snippet) : null;
    }
  },
  {
    code: 'unsupported_high_value',
    level: 'medium',
    penalty: 12,
    test: ctx => {
      // A five-figure claim with no reachable stated payer is a classic lure.
      const hasBigClaim = ctx.rewardMax !== null && ctx.rewardMax >= 10_000;
      const hasPayer = /\b(?:company|client|foundation|organisation|organization|ltd|inc|gmbh|dao|labs)\b/i.test(ctx.text);
      return hasBigClaim && !hasPayer
        ? finding('unsupported_high_value', 'medium', 12,
            'High reward claimed without an identified payer.',
            `rewardMax=${ctx.rewardMax}`)
        : null;
    }
  }
];

function levelForScore(score: number, hasCritical: boolean): RiskLevel {
  if (hasCritical || score < 25) return 'critical';
  if (score < 55) return 'high';
  if (score < 78) return 'medium';
  return 'low';
}

export interface RiskInput {
  title: string;
  provider: string;
  description: string;
  additionalText?: string;
  sourceReliability: number;
  sourceUrl: string;
  directPay: Tri;
  remote: Tri;
  rewardMin: number | null;
  rewardMax: number | null;
  rewardBasis: string | null;
  publishedAt: string | null;
  assertions?: EvidenceAssertion[];
}

export function assessRisk(input: RiskInput): RiskAssessment {
  const text = `${input.title} ${input.provider} ${input.description} ${input.additionalText ?? ''}`
    .replace(/\s+/g, ' ')
    .trim();

  const ctx: RiskContext = {
    title: input.title,
    provider: input.provider,
    description: input.description,
    text,
    sourceReliability: input.sourceReliability,
    directPay: input.directPay,
    remote: input.remote,
    rewardMin: input.rewardMin,
    rewardMax: input.rewardMax,
    rewardBasis: input.rewardBasis,
    sourceUrl: input.sourceUrl,
    publishedAt: input.publishedAt,
    assertions: input.assertions ?? []
  };

  const findings: RiskFinding[] = [];
  for (const rule of RULES) {
    const found = rule.test(ctx);
    if (found) findings.push(found);
  }

  // Bonus for a clean, corroborated posting: a stated payer plus a stated reward.
  const bonuses: RiskFinding[] = [];
  if (input.rewardMin !== null && input.rewardMax !== null) {
    bonuses.push(finding('reward_published', 'low', -6, 'Reward amount is published in the source.', `reward=${input.rewardMin}-${input.rewardMax}`));
  }
  if (input.directPay === true) {
    bonuses.push(finding('direct_pay_confirmed', 'low', -6, 'Direct payment is stated by the source.', 'directPay=true'));
  }

  const penalty = [...findings, ...bonuses].reduce((sum, f) => sum + f.penalty, 0);
  const trustScore = Math.max(0, Math.min(100, BASE_TRUST - penalty));
  const hasCritical = findings.some(f => f.level === 'critical');

  // A very large amount quoted at the applicant is itself a scam marker, even
  // when the wording avoided the explicit fee patterns above. This scans the
  // POSTING text (not the findings) for an amount sitting next to a
  // payment-demand noun.
  const amountSnippet =
    hit(ctx.text, /(?:[$£€₹₦]\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*\s?(?:usd|dollars?))[^.]{0,60}\b(?:fee|deposit|charge|payment|bond)\b/i) ??
    hit(ctx.text, /\b(?:fee|deposit|charge|payment|bond)\b[^.]{0,60}(?:[$£€₹₦]\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*\s?(?:usd|dollars?))/i);
  const quotedAmount = amountSnippet ? extractAmount(amountSnippet) : null;

  if (quotedAmount !== null && quotedAmount >= 100 && !hasCritical) {
    const extra = finding(
      'large_fee_request',
      'high',
      25,
      'A large up-front amount is requested from the applicant.',
      `amount≈${quotedAmount} — ${amountSnippet}`
    );
    findings.push(extra);
    const adjusted = Math.max(0, trustScore - extra.penalty);
    return {
      level: levelForScore(adjusted, hasCritical),
      trustScore: adjusted,
      findings,
      blocked: adjusted < 25
    };
  }

  return {
    level: levelForScore(trustScore, hasCritical),
    trustScore,
    findings,
    blocked: hasCritical || trustScore < 25
  };
}

export const RISK_RULES = RULES;
