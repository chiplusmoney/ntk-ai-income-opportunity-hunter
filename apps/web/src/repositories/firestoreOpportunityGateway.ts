import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import type { FirestoreEvidenceDoc, PublishedOpportunity } from '@ntk/hunter-core';
import { auth, firestore } from '../lib/firebase';
import { PUBLISHED_QUERY, type OpportunityGateway } from './opportunityRepository';

/**
 * Firestore implementation of the opportunity gateway.
 *
 * The query is built from `PUBLISHED_QUERY` (see opportunityRepository.ts) so
 * the filters, the ordering and `firestore.indexes.json` stay in one place.
 *
 * Every document is re-checked after it is read: the security rules already
 * restrict reads to published records, but the client must not render a record
 * it cannot attribute.
 */
export class FirestoreOpportunityGateway implements OpportunityGateway {
  async listPublished(max: number): Promise<PublishedOpportunity[]> {
    if (!firestore) throw new Error('Firebase is not configured');

    const constraints = [
      ...PUBLISHED_QUERY.filters.map(f => where(f.field, f.op, f.value)),
      orderBy(PUBLISHED_QUERY.orderBy.field, PUBLISHED_QUERY.orderBy.direction),
      limit(max)
    ];

    const snapshot = await getDocs(query(collection(firestore, PUBLISHED_QUERY.collection), ...constraints));

    return snapshot.docs
      .map(document => ({ id: document.id, ...document.data() }) as PublishedOpportunity)
      .filter(record => record.visibility === 'published' && record.zeroCapital === true);
  }

  async getEvidence(opportunityId: string): Promise<FirestoreEvidenceDoc | null> {
    if (!firestore) throw new Error('Firebase is not configured');
    if (!auth?.currentUser) return null;
    const snapshot = await getDoc(doc(firestore, 'opportunityEvidence', opportunityId));
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() } as FirestoreEvidenceDoc;
  }
}
