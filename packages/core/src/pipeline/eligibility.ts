import type {
  EligibilityAssessment,
  EligibilityCheck,
  EvidenceAssertion,
  OpportunityCandidate,
  Tri
} from '../types.js';

/**
 * Eligibility engine.
 *
 * ## Blocking vs soft
 * Every check declares whether it can block. The rule is:
 *
 *   - Only a POSITIVELY FAILED blocking check makes a candidate ineligible.
 *   - `unknown` never blocks. It records missing evidence, sets
 *     `needsMoreEvidence` and is shown to the user as "we could not confirm
 *     this", instead of pretending the user is ineligible.
 *   - Soft checks (payment method, skills, category preference) inform the UI
 *     and the ranking but never decide eligibility on their own.
 *
 * This matters for the product's honesty contract: treating silence as a
 * failure would silently discard almost every real posting, and treating
 * silence as a pass would overstate what we verified. Neither is acceptable,
 * so silence is carried through as `unknown`.
 */

export interface EligibilityPreferences {
  /** ISO-3166 alpha-2 primary market. */
  primaryCountry: string;
  additionalCountries: string[];
  globalAllowed: boolean;
  zeroCapitalOnly: boolean;
  directPayPreferred: boolean;
  noCvPreferred: boolean;
  /** V1 is a remote-income product; on-site roles are excluded by default. */
  remoteOnly: boolean;
  competitionsEnabled: boolean;
  categories: string[];
}

export const DEFAULT_ELIGIBILITY_PREFERENCES: EligibilityPreferences = {
  primaryCountry: 'NG',
  additionalCountries: ['GB', 'CA', 'US'],
  globalAllowed: true,
  zeroCapitalOnly: true,
  directPayPreferred: true,
  noCvPreferred: true,
  remoteOnly: true,
  competitionsEnabled: false,
  categories: []
};

const COUNTRY_ALIASES: Record<string, string> = {
  worldwide: 'GLOBAL',
  anywhere: 'GLOBAL',
  global: 'GLOBAL',
  remote: 'GLOBAL',
  'any location': 'GLOBAL',
  'united states': 'US',
  usa: 'US',
  'u.s.': 'US',
  us: 'US',
  'united kingdom': 'GB',
  uk: 'GB',
  'great britain': 'GB',
  england: 'GB',
  canada: 'CA',
  nigeria: 'NG',
  germany: 'DE',
  deutschland: 'DE',
  europe: 'EU',
  'european union': 'EU',
  emea: 'EMEA',
  africa: 'AF',
  asia: 'AS',
  latam: 'LATAM',
  'latin america': 'LATAM'
};

/** Region codes are hints, never country-level proof. */
const REGION_CODES = ['EU', 'EMEA', 'AF', 'AS', 'LATAM'];

/** Map a free-text location string to ISO-ish region codes. */
export function normalizeCountries(value: string | null | undefined): string[] {
  if (!value) return [];
  const parts = value
    .split(/[,;/|]|\band\b|\bor\b/gi)
    .map(p => p.trim().toLowerCase())
    .filter(Boolean);

  const out = new Set<string>();
  for (const part of parts) {
    const alias = COUNTRY_ALIASES[part];
    if (alias) {
      out.add(alias);
      continue;
    }
    // Already an ISO code?
    if (/^[a-z]{2}$/.test(part)) {
      out.add(part.toUpperCase());
      continue;
    }
    // Look for a known country name embedded in a longer phrase.
    for (const [name, code] of Object.entries(COUNTRY_ALIASES)) {
      if (name.length > 3 && part.includes(name)) out.add(code);
    }
  }
  return [...out];
}

function check(id: string, label: string, passed: Tri, detail: string, blocking: boolean): EligibilityCheck {
  return { id, label, passed, detail, blocking };
}

export type EligibilityCandidate = Pick<
  OpportunityCandidate,
  | 'countries'
  | 'eligibilityText'
  | 'noCapitalRequired'
  | 'directPay'
  | 'noCvRequired'
  | 'remote'
  | 'competition'
  | 'deadline'
  | 'paymentMethods'
  | 'category'
>;

export function assessEligibility(
  candidate: EligibilityCandidate,
  prefs: EligibilityPreferences = DEFAULT_ELIGIBILITY_PREFERENCES,
  assertions: EvidenceAssertion[] = [],
  /** Injected clock so deadline checks are reproducible in tests. */
  now: Date = new Date()
): EligibilityAssessment {
  const checks: EligibilityCheck[] = [];
  const reasons: string[] = [];

  const allowed = new Set([prefs.primaryCountry, ...prefs.additionalCountries].map(c => c.toUpperCase()));
  const countries = candidate.countries.length ? candidate.countries : normalizeCountries(candidate.eligibilityText);
  const isGlobal = countries.includes('GLOBAL');

  // --- Country eligibility (blocking when positively restricted) -----------
  if (countries.length === 0) {
    checks.push(
      check('country', 'Country eligibility', 'unknown', 'Source does not state eligible countries.', true)
    );
    reasons.push('Country eligibility could not be confirmed from the source.');
  } else if (isGlobal) {
    checks.push(check('country', 'Country eligibility', true, 'Source states worldwide / location-independent.', true));
  } else {
    const overlapping = countries.filter(c => allowed.has(c));
    const regional = countries.filter(c => REGION_CODES.includes(c));
    const hasConcrete = countries.some(c => /^[A-Z]{2}$/.test(c) && !REGION_CODES.includes(c));

    if (overlapping.length) {
      checks.push(check('country', 'Country eligibility', true, `Eligible for ${overlapping.join(', ')}.`, true));
    } else if (regional.length && !hasConcrete) {
      checks.push(
        check('country', 'Country eligibility', 'unknown', `Only a region is stated (${regional.join(', ')}).`, true)
      );
      reasons.push('Only a region was stated, so country eligibility is unconfirmed.');
    } else {
      checks.push(check('country', 'Country eligibility', false, `Restricted to ${countries.join(', ')}.`, true));
      reasons.push(`Restricted to ${countries.join(', ')}.`);
    }
  }

  // --- Zero capital (blocking when a cost is stated) ------------------------
  // The wording here is what the user reads, so it must not upgrade "no cost
  // found" into "confirmed free".
  if (candidate.noCapitalRequired === false) {
    checks.push(
      check('zeroCapital', 'No upfront capital', false, 'The source states a cost the applicant must pay.', true)
    );
    reasons.push('Requires money up front.');
  } else if (candidate.noCapitalRequired === true) {
    checks.push(
      check('zeroCapital', 'No upfront capital', true, 'The source states no upfront payment is required.', true)
    );
  } else {
    checks.push(
      check(
        'zeroCapital',
        'No upfront capital',
        'unknown',
        'No upfront cost found in the posting, but the source does not state that it is free.',
        true
      )
    );
    reasons.push('No upfront cost was found; verify before proceeding, this is not a confirmed $0.');
  }

  // --- Direct pay (blocking only when the source positively says otherwise) --
  if (candidate.directPay === true) {
    checks.push(check('directPay', 'Direct pay', true, 'Source states payment for delivered work.', prefs.directPayPreferred));
  } else if (candidate.directPay === false) {
    checks.push(
      check(
        'directPay',
        'Direct pay',
        false,
        'Reward is a prize or non-payment benefit, not a fee for work.',
        prefs.directPayPreferred
      )
    );
    reasons.push('Reward is not direct payment for delivered work.');
  } else {
    checks.push(check('directPay', 'Direct pay', 'unknown', 'Payment route not stated in the source.', prefs.directPayPreferred));
  }

  // --- CV requirement (blocking only when a CV is positively required) ------
  if (candidate.noCvRequired === true) {
    checks.push(check('noCv', 'No CV required', true, 'Source states assessment or portfolio instead of a CV.', prefs.noCvPreferred));
  } else if (candidate.noCvRequired === false) {
    checks.push(check('noCv', 'No CV required', false, 'Source explicitly asks for a CV or résumé.', prefs.noCvPreferred));
    reasons.push('A CV or résumé is required.');
  } else {
    checks.push(check('noCv', 'No CV required', 'unknown', 'CV requirement is not stated.', prefs.noCvPreferred));
  }

  // --- Remote (blocking when positively on-site and the user needs remote) --
  if (candidate.remote === true) {
    checks.push(check('remote', 'Remote work', true, 'Source marks the role as remote.', prefs.remoteOnly));
  } else if (candidate.remote === false) {
    checks.push(check('remote', 'Remote work', false, 'Source marks the role as on-site.', prefs.remoteOnly));
    reasons.push('On-site only.');
  } else {
    checks.push(check('remote', 'Remote work', 'unknown', 'Remote/on-site status is not stated.', prefs.remoteOnly));
  }

  // --- Payment method (soft) ----------------------------------------------
  if (candidate.paymentMethods.length) {
    checks.push(check('paymentMethod', 'Payment method', true, `Stated: ${candidate.paymentMethods.join(', ')}.`, false));
  } else {
    checks.push(check('paymentMethod', 'Payment method', 'unknown', 'No payment method stated.', false));
  }

  // --- Deadline (blocking when expired) ------------------------------------
  if (candidate.deadline) {
    const ts = Date.parse(candidate.deadline);
    if (Number.isFinite(ts) && ts < now.getTime()) {
      checks.push(check('deadline', 'Deadline open', false, `Deadline passed (${candidate.deadline}).`, true));
      reasons.push('Deadline has passed.');
    } else {
      checks.push(check('deadline', 'Deadline open', true, `Deadline ${candidate.deadline}.`, true));
    }
  } else {
    checks.push(check('deadline', 'Deadline open', 'unknown', 'No deadline published; assumed rolling.', true));
  }

  // --- Competition preference (blocking when disallowed) -------------------
  if (candidate.competition) {
    checks.push(
      check(
        'competition',
        'Competition allowed',
        prefs.competitionsEnabled,
        prefs.competitionsEnabled ? 'Competitions are enabled in preferences.' : 'Competitions are hidden by default.',
        true
      )
    );
    if (!prefs.competitionsEnabled) reasons.push('Competition-type listings are disabled by preference.');
  }

  // --- Category preference (soft) ------------------------------------------
  if (prefs.categories.length) {
    const wanted = prefs.categories.includes(candidate.category);
    checks.push(
      check(
        'category',
        'Category',
        wanted ? true : 'unknown',
        wanted
          ? `${candidate.category} is in your selected categories.`
          : `${candidate.category} is outside your selected categories.`,
        false
      )
    );
  }

  // --- Skills (informational only, never a gate) ---------------------------
  const skillAssertions = assertions.filter(a => a.field.startsWith('skill.'));
  if (skillAssertions.length) {
    checks.push(check('skills', 'Skills stated', true, `${skillAssertions.length} skill signals extracted.`, false));
  }

  const blockingFailed = checks.filter(c => c.blocking && c.passed === false);
  const unknownGates = checks.filter(c => c.blocking && c.passed === 'unknown');
  const ineligible = blockingFailed.length > 0;

  if (!ineligible && unknownGates.length) {
    reasons.push(`${unknownGates.length} check(s) could not be confirmed from evidence.`);
  }
  if (!ineligible && !reasons.length) reasons.push('All gating checks passed on captured evidence.');

  return {
    eligible: !ineligible,
    needsMoreEvidence: unknownGates.length > 0,
    checks,
    reasons,
    blockingCheckIds: blockingFailed.map(c => c.id),
    ineligible
  };
}
