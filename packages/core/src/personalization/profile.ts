/** Optional earning information. Null/empty means unanswered, never a qualification. */
export interface EarningProfile {
  version: 1;
  country: string;
  timezone: string;
  languages: string[];
  skills: string[];
  skillLevel: 'unknown' | 'beginner' | 'intermediate' | 'advanced';
  experience: 'unknown' | 'none' | 'junior' | 'mid' | 'senior';
  categories: string[];
  industries: string[];
  hoursPerWeek: number | null;
  duration: 'any' | 'task' | 'short-term' | 'ongoing';
  remoteOnly: boolean;
  minimumReward: number | null;
  rewardBasis: 'unknown' | 'one-off' | 'hour' | 'day' | 'week' | 'month' | 'year';
  currencies: string[];
  paymentMethods: string[];
  devices: string[];
  connectivity: string;
  cv: 'unknown' | 'available' | 'none';
  portfolio: 'unknown' | 'available' | 'none';
  github: string;
  linkedin: string;
  portfolioUrl: string;
  certifications: string[];
  education: string;
  willingToLearn: boolean;
  opportunityTypes: string[];
  excludedCategories: string[];
  competitionTolerance: 'unknown' | 'avoid' | 'open';
  deadlineDays: number | null;
  targetMonthlyIncome: number | null;
  shortTermTarget: number | null;
}

export const EMPTY_EARNING_PROFILE: EarningProfile = {
  version: 1, country: '', timezone: '', languages: [], skills: [], skillLevel: 'unknown', experience: 'unknown',
  categories: [], industries: [], hoursPerWeek: null, duration: 'any', remoteOnly: false,
  minimumReward: null, rewardBasis: 'unknown', currencies: [], paymentMethods: [], devices: [], connectivity: '',
  cv: 'unknown', portfolio: 'unknown', github: '', linkedin: '', portfolioUrl: '', certifications: [], education: '',
  willingToLearn: true, opportunityTypes: [], excludedCategories: [], competitionTolerance: 'unknown', deadlineDays: null,
  targetMonthlyIncome: null, shortTermTarget: null
};

export function safeWebUrl(value: string): boolean {
  if (!value) return true;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}

/** Field selection is intentional: server-owned/imported fields cannot enter through a profile form. */
export function validateEarningProfile(input: unknown): { ok: boolean; value: EarningProfile; problems: string[] } {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const value: EarningProfile = { ...EMPTY_EARNING_PROFILE };
  const problems: string[] = [];
  for (const key of Object.keys(EMPTY_EARNING_PROFILE) as (keyof EarningProfile)[]) {
    const raw = source[key];
    if (raw === undefined || key === 'version') continue;
    const fallback = EMPTY_EARNING_PROFILE[key];
    if (Array.isArray(fallback)) {
      if (!Array.isArray(raw) || raw.length > 40 || raw.some(v => typeof v !== 'string' || v.length > 100)) { problems.push(`${key}: use up to 40 short text entries`); continue; }
      (value as unknown as Record<string, unknown>)[key] = [...new Map(raw.map(v => [v.trim().toLowerCase(), v.trim()])).values()].filter(Boolean);
    } else if (fallback === null) {
      if (raw !== null && (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0 || raw > (key === 'hoursPerWeek' ? 168 : key === 'deadlineDays' ? 365 : 1e9))) { problems.push(`${key}: enter a valid non-negative number`); continue; }
      (value as unknown as Record<string, unknown>)[key] = raw;
    } else if (typeof fallback === 'boolean') {
      if (typeof raw !== 'boolean') problems.push(`${key}: expected true or false`);
      else (value as unknown as Record<string, unknown>)[key] = raw;
    } else {
      if (typeof raw !== 'string' || raw.length > 2000) { problems.push(`${key}: expected short text`); continue; }
      (value as unknown as Record<string, unknown>)[key] = raw.trim();
    }
  }
  const enums: Partial<Record<keyof EarningProfile, string[]>> = {
    skillLevel: ['unknown', 'beginner', 'intermediate', 'advanced'], experience: ['unknown', 'none', 'junior', 'mid', 'senior'],
    duration: ['any', 'task', 'short-term', 'ongoing'], cv: ['unknown', 'available', 'none'], portfolio: ['unknown', 'available', 'none'],
    competitionTolerance: ['unknown', 'avoid', 'open'], rewardBasis: ['unknown', 'one-off', 'hour', 'day', 'week', 'month', 'year']
  };
  for (const [key, allowed] of Object.entries(enums)) if (!allowed.includes(String(value[key as keyof EarningProfile]))) problems.push(`${key}: invalid choice`);
  value.country = value.country.toUpperCase();
  if (value.country && !/^[A-Z]{2}$/.test(value.country)) problems.push('country: use a two-letter country code');
  if (value.timezone) { try { new Intl.DateTimeFormat('en', { timeZone: value.timezone }).format(); } catch { problems.push('timezone: use an IANA timezone, such as Africa/Lagos'); } }
  for (const key of ['github', 'linkedin', 'portfolioUrl'] as const) if (!safeWebUrl(value[key])) problems.push(`${key}: use an HTTPS URL without credentials`);
  if (value.currencies.some(c => !/^[A-Z]{3}$/.test(c))) problems.push('currencies: use uppercase three-letter currency codes');
  return { ok: problems.length === 0, value, problems };
}

/** Backward-compatible read, without silently persisting guessed credentials or skills. */
export function earningProfileFromLegacy(raw: Record<string, unknown> | null): EarningProfile {
  if (raw?.earningProfile) return validateEarningProfile(raw.earningProfile).value;
  return validateEarningProfile({ country: typeof raw?.primaryCountry === 'string' && /^[A-Z]{2}$/.test(raw.primaryCountry) ? raw.primaryCountry : '', skills: Array.isArray(raw?.skills) ? raw.skills : [], categories: Array.isArray(raw?.categories) ? raw.categories : [] }).value;
}

export function profileCompletion(p: EarningProfile): { answered: number; total: number; next: string[] } {
  const checks = { country: !!p.country, timezone: !!p.timezone, skills: !!p.skills.length, languages: !!p.languages.length,
    experience: p.experience !== 'unknown', availability: p.hoursPerWeek !== null, payment: !!p.paymentMethods.length,
    cv: p.cv !== 'unknown', portfolio: p.portfolio !== 'unknown', categories: !!p.categories.length };
  return { answered: Object.values(checks).filter(Boolean).length, total: Object.keys(checks).length, next: Object.entries(checks).filter(([,done]) => !done).map(([key]) => key) };
}
