import type { OpportunityCategory } from '@ntk/hunter-core';

/**
 * User profile and preferences.
 *
 * This is the object persisted at `users/{uid}`. It is validated before every
 * write, because a malformed profile changes what the hunter shows a user and a
 * server-side range check is cheaper than debugging a bad document.
 *
 * Primary markets stay Nigeria, United Kingdom, Canada and United States, with
 * global opportunities supported. Competitions remain hidden by default.
 */

/** First-class markets for V1. `GLOBAL` covers worldwide listings. */
export const SUPPORTED_MARKETS = ['NG', 'GB', 'CA', 'US', 'GLOBAL'] as const;
export type SupportedMarket = (typeof SUPPORTED_MARKETS)[number];

/** A user can live outside the first-class markets. */
export const OTHER_MARKET = 'OTHER';

export const PROFILE_CATEGORIES: readonly OpportunityCategory[] = [
  'Development',
  'AI Training',
  'Design',
  'Testing',
  'Research',
  'Writing',
  'Web3',
  'Bounty',
  'Grant',
  'Microtask',
  'Competition',
  'Other'
];

export interface NotificationPreferences {
  push: boolean;
  email: boolean;
  telegram: boolean;
}

export interface UserProfile {
  /** Primary market used for eligibility gating. ISO-3166 alpha-2, or OTHER. */
  primaryCountry: SupportedMarket | typeof OTHER_MARKET;
  /** Additional markets the user may work from. */
  additionalCountries: string[];
  globalAllowed: boolean;
  skills: string[];
  /** Preferred opportunity categories. Empty means "no preference". */
  categories: OpportunityCategory[];
  zeroCapitalOnly: boolean;
  directPayPreferred: boolean;
  noCvPreferred: boolean;
  /** Willing to build a portfolio when a CV is not accepted. */
  portfolioPreferred: boolean;
  /** Competitions are hidden by default. */
  competitionsEnabled: boolean;
  notifications: NotificationPreferences;
  /** Paid AI use is off unless the owner explicitly opts in. */
  paidAiAuthorized: boolean;
  /** Free-text markets the user wants excluded. */
  excludedMarkets: string[];
}

export const DEFAULT_PROFILE: UserProfile = {
  primaryCountry: 'NG',
  additionalCountries: ['GB', 'CA', 'US'],
  globalAllowed: true,
  skills: [],
  categories: [],
  zeroCapitalOnly: true,
  directPayPreferred: true,
  noCvPreferred: true,
  portfolioPreferred: true,
  competitionsEnabled: false,
  notifications: { push: true, email: true, telegram: false },
  paidAiAuthorized: false,
  excludedMarkets: []
};

export interface ProfileValidation {
  ok: boolean;
  profile: UserProfile;
  problems: string[];
  /** Changes the validator made, so a caller can see its input was adjusted. */
  adjustments: string[];
}

const MAX_SKILLS = 40;
const MAX_SKILL_LENGTH = 60;
const MAX_ADDITIONAL_COUNTRIES = 12;

function normalizeMarketCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  if (!code) return null;
  if (code === 'UK') return 'GB';
  if (code === 'USA' || code === 'UNITED STATES') return 'US';
  if (code === 'NIGERIA') return 'NG';
  if (code === 'CANADA') return 'CA';
  if (code === 'UNITED KINGDOM') return 'GB';
  if (code === 'GLOBAL' || code === 'WORLDWIDE') return 'GLOBAL';
  if (/^[A-Z]{2}$/.test(code)) return code;
  return null;
}

function readBoolean(value: unknown, fallback: boolean, field: string, problems: string[], adjustments: string[]): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  problems.push(`${field} must be a boolean`);
  adjustments.push(`${field} fell back to ${fallback}`);
  return fallback;
}

/**
 * Validate and normalise a profile.
 *
 * The validator is total: it always returns a usable profile plus the list of
 * things it had to change or reject, so an onboarding form can show exactly what
 * it fixed instead of silently dropping input.
 */
export function validateProfile(input: unknown): ProfileValidation {
  const problems: string[] = [];
  const adjustments: string[] = [];
  const source = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  if (Object.keys(source).length === 0) problems.push('profile was empty or not an object');

  // --- Market ------------------------------------------------------------
  const rawPrimary = normalizeMarketCode(source.primaryCountry);
  const allowedPrimary = [...SUPPORTED_MARKETS, OTHER_MARKET] as string[];

  // A value was supplied but could not be read as a market: that is a problem to
  // report, not something to silently replace with a default.
  if (source.primaryCountry !== undefined && rawPrimary === null) {
    problems.push(`primaryCountry "${String(source.primaryCountry)}" is not a supported market`);
  }

  const primaryCountry: UserProfile['primaryCountry'] =
    rawPrimary && allowedPrimary.includes(rawPrimary)
      ? (rawPrimary as UserProfile['primaryCountry'])
      : DEFAULT_PROFILE.primaryCountry;
  if (rawPrimary && !allowedPrimary.includes(rawPrimary)) {
    problems.push(`primaryCountry "${rawPrimary}" is not a supported market`);
    adjustments.push(`primaryCountry reset to ${primaryCountry}`);
  }
  if (source.primaryCountry === undefined) adjustments.push('primaryCountry defaulted');

  const additionalRaw = Array.isArray(source.additionalCountries) ? source.additionalCountries : [];
  if (source.additionalCountries !== undefined && !Array.isArray(source.additionalCountries)) {
    problems.push('additionalCountries must be an array');
  }
  const additionalCountries: string[] = [];

  // An ABSENT list means "not answered yet" and takes the product default; an
  // explicitly empty list means the user wants no additional markets. Collapsing
  // those two would silently re-add markets the user removed.
  const additionalSource =
    source.additionalCountries === undefined
      ? [...DEFAULT_PROFILE.additionalCountries]
      : additionalRaw;

  for (const entry of additionalSource) {
    const code = normalizeMarketCode(entry);
    if (!code) {
      problems.push(`additionalCountries entry "${String(entry)}" is not a market code`);
      continue;
    }
    if (code === primaryCountry) continue;
    if (!additionalCountries.includes(code)) additionalCountries.push(code);
  }
  if (additionalCountries.length > MAX_ADDITIONAL_COUNTRIES) {
    additionalCountries.length = MAX_ADDITIONAL_COUNTRIES;
    adjustments.push(`additionalCountries truncated to ${MAX_ADDITIONAL_COUNTRIES}`);
  }

  // --- Skills ------------------------------------------------------------
  const skillsRaw = Array.isArray(source.skills) ? source.skills : [];
  if (source.skills !== undefined && !Array.isArray(source.skills)) problems.push('skills must be an array');
  const skills: string[] = [];
  for (const entry of skillsRaw) {
    if (typeof entry !== 'string') {
      problems.push('skills entries must be strings');
      continue;
    }
    const skill = entry.trim();
    if (!skill) continue;
    if (skill.length > MAX_SKILL_LENGTH) {
      adjustments.push(`skill "${skill.slice(0, 20)}…" truncated`);
    }
    const bounded = skill.slice(0, MAX_SKILL_LENGTH);
    if (!skills.some(existing => existing.toLowerCase() === bounded.toLowerCase())) skills.push(bounded);
  }
  if (skills.length > MAX_SKILLS) {
    skills.length = MAX_SKILLS;
    adjustments.push(`skills truncated to ${MAX_SKILLS}`);
  }

  // --- Categories --------------------------------------------------------
  const categoriesRaw = Array.isArray(source.categories) ? source.categories : [];
  if (source.categories !== undefined && !Array.isArray(source.categories)) {
    problems.push('categories must be an array');
  }
  const categories: OpportunityCategory[] = [];
  for (const entry of categoriesRaw) {
    if (typeof entry !== 'string' || !PROFILE_CATEGORIES.includes(entry as OpportunityCategory)) {
      problems.push(`category "${String(entry)}" is not in the product taxonomy`);
      continue;
    }
    const category = entry as OpportunityCategory;
    if (!categories.includes(category)) categories.push(category);
  }

  // --- Excluded markets --------------------------------------------------
  const excludedRaw = Array.isArray(source.excludedMarkets) ? source.excludedMarkets : [];
  const excludedMarkets: string[] = [];
  for (const entry of excludedRaw) {
    const code = normalizeMarketCode(entry);
    if (code && !excludedMarkets.includes(code)) excludedMarkets.push(code);
  }

  // --- Notifications -----------------------------------------------------
  const notificationsSource =
    typeof source.notifications === 'object' && source.notifications !== null
      ? (source.notifications as Record<string, unknown>)
      : {};

  const notifications: NotificationPreferences = {
    push: readBoolean(notificationsSource.push, DEFAULT_PROFILE.notifications.push, 'notifications.push', problems, adjustments),
    email: readBoolean(notificationsSource.email, DEFAULT_PROFILE.notifications.email, 'notifications.email', problems, adjustments),
    telegram: readBoolean(
      notificationsSource.telegram,
      DEFAULT_PROFILE.notifications.telegram,
      'notifications.telegram',
      problems,
      adjustments
    )
  };

  const profile: UserProfile = {
    primaryCountry,
    additionalCountries,
    globalAllowed: readBoolean(source.globalAllowed, DEFAULT_PROFILE.globalAllowed, 'globalAllowed', problems, adjustments),
    skills,
    categories,
    // Default true: the product promise is zero-capital first.
    zeroCapitalOnly: readBoolean(source.zeroCapitalOnly, DEFAULT_PROFILE.zeroCapitalOnly, 'zeroCapitalOnly', problems, adjustments),
    directPayPreferred: readBoolean(
      source.directPayPreferred,
      DEFAULT_PROFILE.directPayPreferred,
      'directPayPreferred',
      problems,
      adjustments
    ),
    noCvPreferred: readBoolean(source.noCvPreferred, DEFAULT_PROFILE.noCvPreferred, 'noCvPreferred', problems, adjustments),
    portfolioPreferred: readBoolean(
      source.portfolioPreferred,
      DEFAULT_PROFILE.portfolioPreferred,
      'portfolioPreferred',
      problems,
      adjustments
    ),
    // Default false: competitions stay hidden unless asked for.
    competitionsEnabled: readBoolean(
      source.competitionsEnabled,
      DEFAULT_PROFILE.competitionsEnabled,
      'competitionsEnabled',
      problems,
      adjustments
    ),
    notifications,
    paidAiAuthorized: readBoolean(source.paidAiAuthorized, DEFAULT_PROFILE.paidAiAuthorized, 'paidAiAuthorized', problems, adjustments),
    excludedMarkets
  };

  return { ok: problems.length === 0, profile, problems, adjustments };
}

/** Countries the profile allows, in the order the hunter should consider them. */
export function allowedMarkets(profile: UserProfile): string[] {
  const markets = [profile.primaryCountry, ...profile.additionalCountries];
  if (profile.globalAllowed) markets.push('GLOBAL');
  return markets.filter(market => !profile.excludedMarkets.includes(market));
}
