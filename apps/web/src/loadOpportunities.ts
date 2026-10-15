import { firebaseConfigured } from './lib/firebase';
import { getCachedOpportunities, cacheOpportunities } from './offline';
import {
  HybridOpportunityRepository,
  type ListResult,
  type OpportunityCache,
  type OpportunityGateway
} from './repositories/opportunityRepository';
import { mapPublishedOpportunity } from './repositories/mapPublishedOpportunity';
import type { Opportunity } from './types';

/**
 * Wiring: connects the UI to the Firestore gateway and the offline cache.
 *
 * Kept out of the components so the repository stays testable and so the
 * "is Firebase configured on this deployment?" question is answered in exactly
 * one place.
 */

const cache: OpportunityCache = {
  read: getCachedOpportunities,
  write: cacheOpportunities
};

export interface LoadedOpportunities extends ListResult {
  /** True only when the caller is looking at the bundled demo rows. */
  demo: boolean;
}

/**
 * Load opportunities for the shell.
 *
 * With Firebase configured the gateway is loaded lazily, so a deployment
 * without credentials never pulls the Firestore client into the initial bundle.
 * Without credentials the repository serves the cache (or an empty result) and
 * the shell keeps showing its labelled demo rows.
 */
export async function loadOpportunities(max = 50): Promise<LoadedOpportunities> {
  let gateway: OpportunityGateway | null = null;

  if (firebaseConfigured) {
    const { FirestoreOpportunityGateway } = await import('./repositories/firestoreOpportunityGateway');
    const publicGateway = new FirestoreOpportunityGateway();
    // The shared offline catalog must contain only public records. Evidence
    // snapshots are read separately after sign-in and stay in component memory.
    gateway = { listPublished: max => publicGateway.listPublished(max), getEvidence: async () => null };
  }

  const repository = new HybridOpportunityRepository({
    gateway,
    cache,
    map: (record, evidence) => mapPublishedOpportunity(record, { now: new Date(), evidence }),
    now: () => new Date(),
    isOnline: () => (typeof navigator === 'undefined' ? true : navigator.onLine)
  });

  const result = await repository.listBest(max);
  return { ...result, demo: false };
}

/** Persist a mapped opportunity list as a cache refresh from the UI. */
export async function refreshCache(items: Opportunity[]): Promise<void> {
  await cacheOpportunities(items);
}
