import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE,
  PROFILE_CATEGORIES,
  SUPPORTED_MARKETS,
  allowedMarkets,
  validateProfile
} from '../auth/userProfile';
import { ProfileRepository } from '../repositories/profileRepository';
import { MemoryProfileGateway } from '../repositories/firestoreProfileGateway';

describe('profile defaults', () => {
  it('keeps the four first-class markets plus global', () => {
    expect(SUPPORTED_MARKETS).toEqual(['NG', 'GB', 'CA', 'US', 'GLOBAL']);
    expect(DEFAULT_PROFILE.primaryCountry).toBe('NG');
    expect(DEFAULT_PROFILE.additionalCountries).toEqual(['GB', 'CA', 'US']);
    expect(DEFAULT_PROFILE.globalAllowed).toBe(true);
  });

  it('keeps competitions hidden and zero-capital on by default', () => {
    expect(DEFAULT_PROFILE.competitionsEnabled).toBe(false);
    expect(DEFAULT_PROFILE.zeroCapitalOnly).toBe(true);
  });

  it('never defaults paid AI to authorised', () => {
    expect(DEFAULT_PROFILE.paidAiAuthorized).toBe(false);
  });

  it('covers every product category exactly once', () => {
    expect(new Set(PROFILE_CATEGORIES).size).toBe(PROFILE_CATEGORIES.length);
    expect(PROFILE_CATEGORIES).toContain('Competition');
    expect(PROFILE_CATEGORIES).toContain('Other');
  });
});

describe('profile validation', () => {
  it('accepts a well-formed profile unchanged', () => {
    const result = validateProfile({
      primaryCountry: 'NG',
      additionalCountries: ['GB', 'CA'],
      skills: ['React', 'TypeScript'],
      categories: ['Development'],
      zeroCapitalOnly: true,
      directPayPreferred: true,
      noCvPreferred: true,
      portfolioPreferred: true,
      competitionsEnabled: false,
      notifications: { push: true, email: false, telegram: true },
      paidAiAuthorized: false,
      globalAllowed: true
    });
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.profile.skills).toEqual(['React', 'TypeScript']);
    expect(result.profile.notifications.telegram).toBe(true);
  });

  it('normalises country aliases', () => {
    const result = validateProfile({
      primaryCountry: 'uk',
      additionalCountries: ['USA', 'Nigeria', 'worldwide']
    });
    expect(result.profile.primaryCountry).toBe('GB');
    expect(result.profile.additionalCountries).toEqual(['US', 'NG', 'GLOBAL']);
  });

  it('rejects a market that is not a code and reports the adjustment', () => {
    const result = validateProfile({ primaryCountry: 'Atlantis' });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/not a supported market/i);
    expect(result.profile.primaryCountry).toBe('NG');
  });

  it('reports a supplied market it cannot normalise rather than silently defaulting', () => {
    const result = validateProfile({ primaryCountry: 'ZZ' });
    // 'ZZ' is a well-formed but unsupported code: still reported.
    expect(result.ok).toBe(false);
    expect(result.adjustments.join(' ')).toMatch(/reset to NG|defaulted/i);
  });

  it('drops the primary country from the additional list', () => {
    const result = validateProfile({ primaryCountry: 'NG', additionalCountries: ['NG', 'GB'] });
    expect(result.profile.additionalCountries).toEqual(['GB']);
  });

  it('deduplicates skills case-insensitively and trims them', () => {
    const result = validateProfile({ skills: ['  React ', 'react', 'React', '', 'TypeScript'] });
    expect(result.profile.skills).toEqual(['React', 'TypeScript']);
  });

  it('bounds the skills list', () => {
    const result = validateProfile({ skills: Array.from({ length: 60 }, (_, index) => `skill-${index}`) });
    expect(result.profile.skills.length).toBeLessThanOrEqual(40);
    expect(result.adjustments.join(' ')).toMatch(/truncated/i);
  });

  it('rejects a category outside the taxonomy', () => {
    const result = validateProfile({ categories: ['Development', 'Cryptocurrency Mining'] });
    expect(result.ok).toBe(false);
    expect(result.profile.categories).toEqual(['Development']);
  });

  it('rejects a non-boolean preference and falls back safely', () => {
    const result = validateProfile({ zeroCapitalOnly: 'yes' });
    expect(result.ok).toBe(false);
    // The safe fallback keeps the product promise rather than disabling it.
    expect(result.profile.zeroCapitalOnly).toBe(true);
    expect(result.profile.competitionsEnabled).toBe(false);
  });

  it('reports an empty input instead of silently succeeding', () => {
    const result = validateProfile({});
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/empty or not an object/i);
    // The defaults are still returned so onboarding can proceed.
    expect(result.profile.primaryCountry).toBe('NG');
    expect(result.profile.additionalCountries).toEqual(['GB', 'CA', 'US']);
    expect(result.profile.skills).toEqual([]);
    expect(result.profile.categories).toEqual([]);
    expect(result.profile.competitionsEnabled).toBe(false);
    expect(result.profile.zeroCapitalOnly).toBe(true);
    expect(result.profile.notifications).toEqual({ push: true, email: true, telegram: false });
  });

  it('handles null and non-object input', () => {
    expect(validateProfile(null).ok).toBe(false);
    expect(validateProfile('nope').ok).toBe(false);
    expect(validateProfile(42).ok).toBe(false);
  });

  it('keeps notification sub-preferences independent', () => {
    const result = validateProfile({ notifications: { push: false } });
    expect(result.profile.notifications.push).toBe(false);
    // Unspecified channels keep their defaults rather than being switched off.
    expect(result.profile.notifications.email).toBe(true);
  });

  it('honours an explicitly empty additional-country list', () => {
    const result = validateProfile({ primaryCountry: 'NG', additionalCountries: [] });
    expect(result.profile.additionalCountries).toEqual([]);
    expect(allowedMarkets(result.profile)).toEqual(['NG', 'GLOBAL']);
  });

  it('is deterministic', () => {
    const input = { primaryCountry: 'ca', skills: ['x'], categories: ['Testing'] };
    expect(JSON.stringify(validateProfile(input))).toBe(JSON.stringify(validateProfile(input)));
  });
});

describe('allowedMarkets', () => {
  it('lists the primary market first, then additional, then global', () => {
    expect(allowedMarkets(DEFAULT_PROFILE)).toEqual(['NG', 'GB', 'CA', 'US', 'GLOBAL']);
  });

  it('omits global when the user does not allow it', () => {
    expect(allowedMarkets({ ...DEFAULT_PROFILE, globalAllowed: false })).not.toContain('GLOBAL');
  });

  it('honours excluded markets', () => {
    expect(allowedMarkets({ ...DEFAULT_PROFILE, excludedMarkets: ['GB'] })).not.toContain('GB');
  });
});

describe('profile repository', () => {
  it('returns defaults for a fresh account without erroring', async () => {
    const repository = new ProfileRepository(new MemoryProfileGateway());
    const result = await repository.load('uid-1');
    expect(result.exists).toBe(false);
    expect(result.profile).toEqual(DEFAULT_PROFILE);
  });

  it('round-trips a saved profile', async () => {
    const gateway = new MemoryProfileGateway();
    const repository = new ProfileRepository(gateway);

    const saved = await repository.save({
      uid: 'uid-1',
      authenticatedUid: 'uid-1',
      profile: { primaryCountry: 'CA', skills: ['Figma'], categories: ['Design'], notifications: { push: true, email: true, telegram: true } }
    });
    expect(saved.ok).toBe(true);
    expect(saved.written).toBe(true);
    expect(gateway.writes).toHaveLength(1);

    const loaded = await repository.load('uid-1');
    expect(loaded.exists).toBe(true);
    expect(loaded.profile.primaryCountry).toBe('CA');
    expect(loaded.profile.skills).toEqual(['Figma']);
    expect(loaded.profile.notifications.telegram).toBe(true);
  });

  it('refuses to write a profile for another user', async () => {
    const gateway = new MemoryProfileGateway();
    const repository = new ProfileRepository(gateway);
    const result = await repository.save({ uid: 'uid-2', authenticatedUid: 'uid-1', profile: {} });
    expect(result.ok).toBe(false);
    expect(result.written).toBe(false);
    expect(result.problems.join(' ')).toMatch(/another user/i);
    expect(gateway.writes).toHaveLength(0);
  });

  it('does not write an invalid profile', async () => {
    const gateway = new MemoryProfileGateway();
    const repository = new ProfileRepository(gateway);
    const result = await repository.save({
      uid: 'uid-1',
      authenticatedUid: 'uid-1',
      profile: { categories: ['Not A Category'] }
    });
    expect(result.written).toBe(false);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(gateway.writes).toHaveLength(0);
  });

  it('reports a stored profile that no longer validates, but still returns one', async () => {
    const gateway = new MemoryProfileGateway({ 'uid-9': { primaryCountry: 'XX', categories: ['Nope'] } });
    const repository = new ProfileRepository(gateway);
    const result = await repository.load('uid-9');
    expect(result.exists).toBe(true);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.profile.primaryCountry).toBe('NG');
  });

  it('returns the normalised profile after a save', async () => {
    const gateway = new MemoryProfileGateway();
    const repository = new ProfileRepository(gateway);
    const result = await repository.save({
      uid: 'uid-1',
      authenticatedUid: 'uid-1',
      profile: { primaryCountry: 'uk', skills: [' React ', 'react'] }
    });
    expect(result.profile.primaryCountry).toBe('GB');
    expect(result.profile.skills).toEqual(['React']);
  });

  it('refuses a save with no uid at all', async () => {
    const repository = new ProfileRepository(new MemoryProfileGateway());
    const result = await repository.save({ uid: '', authenticatedUid: '', profile: {} });
    expect(result.ok).toBe(false);
    expect(result.problems.join(' ')).toMatch(/without both/i);
  });
});
