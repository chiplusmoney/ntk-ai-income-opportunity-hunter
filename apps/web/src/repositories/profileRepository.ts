import { DEFAULT_PROFILE, validateProfile, type UserProfile } from '../auth/userProfile';

/**
 * Profile persistence.
 *
 * The gateway is a port so the repository logic is testable without Firebase,
 * and so a future server-side profile API can replace the direct Firestore write
 * without touching the screens.
 *
 * Security rules that matter here:
 *  - A profile is only ever written under the authenticated uid. The repository
 *    refuses a mismatch rather than trusting a caller-supplied id, which is what
 *    turns a client bug into a cross-account write.
 *  - The write is validated first; no malformed document reaches Firestore.
 */

export interface ProfileGateway {
  /** Read `users/{uid}`, or null when the document does not exist yet. */
  load(uid: string): Promise<unknown | null>;
  /** Merge-write the profile into `users/{uid}`. */
  save(uid: string, profile: UserProfile): Promise<void>;
}

export interface ProfileSaveResult {
  ok: boolean;
  profile: UserProfile;
  /** Validation problems; the document is not written when any exist. */
  problems: string[];
  /** Normalisations the validator applied before writing. */
  adjustments: string[];
  written: boolean;
}

export class ProfileRepository {
  constructor(private readonly gateway: ProfileGateway) {}

  /**
   * Load a profile, falling back to defaults.
   * A missing or malformed document yields defaults rather than an error, so
   * onboarding still works on a fresh account.
   */
  async load(uid: string): Promise<{ profile: UserProfile; exists: boolean; problems: string[] }> {
    const raw = await this.gateway.load(uid);
    if (raw === null || raw === undefined) {
      return { profile: { ...DEFAULT_PROFILE }, exists: false, problems: [] };
    }

    const validation = validateProfile(raw);
    return {
      profile: validation.profile,
      exists: true,
      // Report what was wrong, but do not fail a read: the user still gets a
      // usable profile and can fix it on the next save.
      problems: validation.problems
    };
  }

  /**
   * Validate then persist.
   * Returns the normalised profile so the caller can update its form state to
   * exactly what was stored.
   */
  async save(params: { uid: string; authenticatedUid: string; profile: unknown }): Promise<ProfileSaveResult> {
    if (!params.uid || !params.authenticatedUid) {
      return {
        ok: false,
        profile: { ...DEFAULT_PROFILE },
        problems: ['a profile cannot be saved without both a target uid and an authenticated uid'],
        adjustments: [],
        written: false
      };
    }
    if (params.uid !== params.authenticatedUid) {
      return {
        ok: false,
        profile: { ...DEFAULT_PROFILE },
        problems: ['refusing to write a profile for another user'],
        adjustments: [],
        written: false
      };
    }

    const validation = validateProfile(params.profile);
    if (!validation.ok) {
      return {
        ok: false,
        profile: validation.profile,
        problems: validation.problems,
        adjustments: validation.adjustments,
        written: false
      };
    }

    await this.gateway.save(params.uid, validation.profile);
    return {
      ok: true,
      profile: validation.profile,
      problems: [],
      adjustments: validation.adjustments,
      written: true
    };
  }
}
