import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

/**
 * Behavioural verification of `firestore.rules` against the Firestore emulator.
 *
 * Uses the official rules-testing harness, so these are real rule evaluations
 * with real (emulated) auth contexts — not a reading of the rules file.
 *
 * The claims under test, all of which M5 requires to be *tested*:
 *
 *  1. a browser cannot write the server-managed collections
 *     (`opportunities`, `opportunityEvidence`, `internalSourceRuns`);
 *  2. published opportunities are anonymously readable, and only when
 *     `visibility == 'published'`;
 *  3. evidence requires sign-in;
 *  4. a user cannot read or write another user's private documents;
 *  5. a user can read and write their own private documents;
 *  6. clients cannot create notifications (server-only writes);
 *  7. a forged `capitalStatus` can never be written by a client, which is what
 *     stops a browser from upgrading an unconfirmed record to "confirmed free".
 *
 * Runs only under the emulator harness (`npm run verify:emulator`). No live
 * project, no credentials.
 */
const enabled = process.env.FIREBASE_EMULATOR_TEST === '1';

const here = dirname(fileURLToPath(import.meta.url));
const rulesPath = join(here, '..', '..', '..', 'firestore.rules');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? 'demo-ntk-hunter';
const STAMP = 'sec';

describe.skipIf(!enabled)('firestore.rules behaviour', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: readFileSync(rulesPath, 'utf8'),
        host: '127.0.0.1',
        port: 8080
      }
    });

    // Seed the server-managed documents the way the Hunter API would. This runs
    // with rules disabled, which is exactly the server's privilege.
    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'opportunities', `published-${STAMP}`), {
        id: `published-${STAMP}`,
        visibility: 'published',
        zeroCapital: true,
        capitalStatus: 'unconfirmed_no_cost_found',
        rankScore: 71,
        title: 'Seeded published opportunity'
      });
      await setDoc(doc(db, 'opportunities', `draft-${STAMP}`), {
        id: `draft-${STAMP}`,
        visibility: 'draft',
        zeroCapital: true,
        capitalStatus: 'unconfirmed_no_cost_found',
        rankScore: 10
      });
      await setDoc(doc(db, 'opportunityEvidence', `published-${STAMP}`), {
        id: `published-${STAMP}`,
        opportunityId: `published-${STAMP}`,
        contentHash: 'a'.repeat(64),
        totalAssertions: 9,
        unknownFieldCount: 4,
        capitalStatus: 'unconfirmed_no_cost_found'
      });
      await setDoc(doc(db, 'internalSourceRuns', `remotive_${STAMP}`), {
        id: `remotive_${STAMP}`,
        sourceId: 'remotive',
        startedAt: '2026-10-15T05:00:00.000Z'
      });
      await setDoc(doc(db, 'users', 'alice'), { primaryCountry: 'NG', zeroCapitalOnly: true });
      await setDoc(doc(db, 'users', 'alice', 'applications', 'app-1'), { status: 'applied' });
      await setDoc(doc(db, 'users', 'alice', 'earnings', 'earn-1'), { paidUsd: 120 });
      await setDoc(doc(db, 'users', 'alice', 'notifications', 'server-alert'), { title: 'Server alert' });
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  const anon = () => testEnv.unauthenticatedContext().firestore();
  const asAlice = () => testEnv.authenticatedContext('alice').firestore();
  const asBob = () => testEnv.authenticatedContext('bob').firestore();

  it('lets anyone read a published opportunity', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'opportunities', `published-${STAMP}`)));
  });

  it('hides an unpublished opportunity from everyone', async () => {
    await assertFails(getDoc(doc(anon(), 'opportunities', `draft-${STAMP}`)));
    await assertFails(getDoc(doc(asAlice(), 'opportunities', `draft-${STAMP}`)));
  });

  it('refuses a client write to opportunities, signed in or not', async () => {
    await assertFails(
      setDoc(doc(anon(), 'opportunities', `forged-${STAMP}`), { visibility: 'published', rankScore: 100 })
    );
    await assertFails(
      setDoc(doc(asAlice(), 'opportunities', `forged-${STAMP}`), { visibility: 'published', rankScore: 100 })
    );
  });

  it('refuses a client write that would upgrade a record to confirmed free', async () => {
    // The exact forgery the product must be immune to: a browser asserting a
    // stronger cost claim than the evidence supports.
    await assertFails(
      setDoc(doc(asAlice(), 'opportunities', `published-${STAMP}`), { capitalStatus: 'confirmed_free' }, { merge: true })
    );
    await assertFails(
      setDoc(doc(asAlice(), 'opportunityEvidence', `published-${STAMP}`), { capitalStatus: 'confirmed_free' }, { merge: true })
    );
  });

  it('refuses a client write to the evidence collection', async () => {
    await assertFails(setDoc(doc(asAlice(), 'opportunityEvidence', `forged-${STAMP}`), { contentHash: 'b'.repeat(64) }));
  });

  it('requires sign-in to read evidence', async () => {
    await assertFails(getDoc(doc(anon(), 'opportunityEvidence', `published-${STAMP}`)));
    await assertSucceeds(getDoc(doc(asAlice(), 'opportunityEvidence', `published-${STAMP}`)));
  });

  it('keeps the run audit trail invisible to every client', async () => {
    await assertFails(getDoc(doc(anon(), 'internalSourceRuns', `remotive_${STAMP}`)));
    await assertFails(getDoc(doc(asAlice(), 'internalSourceRuns', `remotive_${STAMP}`)));
    await assertFails(setDoc(doc(asAlice(), 'internalSourceRuns', `forged-${STAMP}`), { sourceId: 'forged' }));
  });

  it('lets a user read and write their own profile', async () => {
    await assertSucceeds(setDoc(doc(asAlice(), 'users', 'alice'), { primaryCountry: 'GB' }, { merge: true }));
    await assertSucceeds(getDoc(doc(asAlice(), 'users', 'alice')));
  });

  it('stops a user from reading or writing another user’s profile', async () => {
    await assertFails(getDoc(doc(asBob(), 'users', 'alice')));
    await assertFails(setDoc(doc(asBob(), 'users', 'alice'), { primaryCountry: 'US' }, { merge: true }));
    await assertSucceeds(getDoc(doc(asAlice(), 'users', 'alice')));
  });

  it('stops a user from reading another user’s applications and earnings', async () => {
    await assertFails(getDoc(doc(asBob(), 'users', 'alice', 'applications', 'app-1')));
    await assertFails(getDoc(doc(asBob(), 'users', 'alice', 'earnings', 'earn-1')));
    await assertSucceeds(getDoc(doc(asAlice(), 'users', 'alice', 'applications', 'app-1')));
  });

  it('refuses a forged earnings claim written by another user', async () => {
    await assertFails(setDoc(doc(asBob(), 'users', 'alice', 'earnings', 'earn-forged'), { paidUsd: 100000 }));
  });

  it('does not let a client create its own notifications', async () => {
    await assertFails(setDoc(doc(asAlice(), 'users', 'alice', 'notifications', 'fake-1'), { title: 'Fake alert' }));
  });

  it('lets the owner read and update a server-created notification', async () => {
    await assertSucceeds(getDoc(doc(asAlice(), 'users', 'alice', 'notifications', 'server-alert')));
    await assertSucceeds(
      setDoc(doc(asAlice(), 'users', 'alice', 'notifications', 'server-alert'), { read: true }, { merge: true })
    );
    await assertFails(getDoc(doc(asBob(), 'users', 'alice', 'notifications', 'server-alert')));
  });

  it('lets a user read and write the offline sync queue, and nobody else', async () => {
    await assertSucceeds(
      setDoc(doc(asAlice(), 'users', 'alice', 'syncQueue', 'job-1'), {
        action: 'save-opportunity',
        queuedAt: '2026-10-15T05:00:00.000Z'
      })
    );
    await assertFails(getDoc(doc(asBob(), 'users', 'alice', 'syncQueue', 'job-1')));
  });

  it.each(['saved', 'applications', 'earnings', 'notifications'])('isolates all private %s operations from other users and anonymous callers', async name => {
    const id = `isolation-${name}`;
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'users', 'alice', name, id), { read: false, title: 'Server test record' });
    });
    for (const db of [anon(), asBob()]) {
      const ref = doc(db, 'users', 'alice', name, id);
      await assertFails(getDoc(ref));
      await assertFails(setDoc(ref, { read: true }, { merge: true }));
      await assertFails(deleteDoc(ref));
    }
    await assertSucceeds(getDoc(doc(asAlice(), 'users', 'alice', name, id)));
  });

  it('allows notification mark-read and delete but rejects edits to delivery evidence', async () => {
    const ref = doc(asAlice(), 'users', 'alice', 'notifications', 'server-alert');
    await assertSucceeds(updateDoc(ref, { read: true }));
    await assertFails(updateDoc(ref, { title: 'Forged delivery', status: 'delivered' }));
    await assertFails(updateDoc(ref, { read: 'yes' }));
    await assertSucceeds(deleteDoc(ref));
  });

  it('leaves the seeded documents intact after every denied attempt', async () => {
    // Read back with rules bypassed: this is a check on what the DENIED writes
    // did NOT change, so it must not itself be subject to the rules.
    let publishedExists = false;
    let publishedRank: unknown = null;
    let forgedExists = true;

    await testEnv.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      const published = await db.doc(`opportunities/published-${STAMP}`).get();
      publishedExists = published.exists;
      publishedRank = published.data()?.rankScore;
      const forged = await db.doc(`opportunities/forged-${STAMP}`).get();
      forgedExists = forged.exists;
    });

    expect(publishedExists).toBe(true);
    expect(publishedRank).toBe(71);
    expect(forgedExists).toBe(false);
  });
});
