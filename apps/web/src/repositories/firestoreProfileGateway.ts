import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import type { UserProfile } from '../auth/userProfile';
import type { ProfileGateway } from './profileRepository';

/**
 * Firestore implementation of the profile gateway.
 *
 * `setDoc(..., { merge: true })` so a partial profile update cannot wipe fields
 * the client did not send, and every write goes to `users/{uid}` — the only path
 * `firestore.rules` allows a signed-in user to touch.
 */
export class FirestoreProfileGateway implements ProfileGateway {
  async load(uid: string): Promise<unknown | null> {
    if (!firestore) throw new Error('Firebase is not configured');
    const snapshot = await getDoc(doc(firestore, 'users', uid));
    return snapshot.exists() ? (snapshot.data() as unknown) : null;
  }

  async save(uid: string, profile: UserProfile): Promise<void> {
    if (!firestore) throw new Error('Firebase is not configured');
    await setDoc(
      doc(firestore, 'users', uid),
      { ...profile, updatedAt: new Date().toISOString() },
      { merge: true }
    );
  }
}

/** In-memory gateway used by tests and by the offline-only UI shell. */
export class MemoryProfileGateway implements ProfileGateway {
  readonly writes: { uid: string; profile: UserProfile }[] = [];

  constructor(private readonly documents: Record<string, unknown> = {}) {}

  async load(uid: string): Promise<unknown | null> {
    return this.documents[uid] ?? null;
  }

  async save(uid: string, profile: UserProfile): Promise<void> {
    this.writes.push({ uid, profile });
    this.documents[uid] = profile;
  }
}
