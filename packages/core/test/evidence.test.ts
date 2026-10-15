import { describe, expect, it } from 'vitest';
import {
  absentAssertion,
  assertion,
  createSnapshot,
  evidenceHash,
  excerpt,
  htmlToText,
  isEstablished,
  mergeEvidence,
  sha256Hex,
  unknownFieldCount
} from '../src/evidence/index.js';
import { FIXED_NOW, snapshot } from './helpers.js';

describe('htmlToText', () => {
  it('strips tags and scripts and collapses whitespace', () => {
    const html = '<div><p>Hello   <b>world</b></p><script>alert(1)</script></div>';
    expect(htmlToText(html)).toBe('Hello world');
  });

  it('decodes the entities the real feeds publish', () => {
    expect(htmlToText('Q&amp;A &quot;now&quot; &#39;yes&#39; &nbsp;done')).toBe('Q&A "now" \'yes\' done');
  });
});

describe('sha256Hex', () => {
  it('matches the known NIST vector for "abc"', async () => {
    // Cross-checked against the published SHA-256 test vector.
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('matches the empty-string vector', async () => {
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('changes when a single byte changes', async () => {
    expect(await sha256Hex('payload-a')).not.toBe(await sha256Hex('payload-b'));
  });
});

describe('createSnapshot', () => {
  it('hashes the payload, counts bytes and bounds the excerpt', async () => {
    const payload = 'x'.repeat(1000);
    const snap = await createSnapshot({
      sourceId: 'remotive',
      sourceUrl: 'https://example.test/a',
      fetchedAt: FIXED_NOW.toISOString(),
      payload,
      httpStatus: 200
    });
    expect(snap.contentHash).toHaveLength(64);
    expect(snap.bytes).toBe(1000);
    expect(snap.excerpt.length).toBeLessThanOrEqual(400);
    expect(snap.httpStatus).toBe(200);
  });

  it('produces the same hash for the same payload', async () => {
    const a = await createSnapshot({
      sourceId: 's',
      sourceUrl: 'u',
      fetchedAt: FIXED_NOW.toISOString(),
      payload: 'same',
      httpStatus: 200
    });
    const b = await createSnapshot({
      sourceId: 's',
      sourceUrl: 'u',
      fetchedAt: '2026-10-15T00:00:00.000Z',
      payload: 'same',
      httpStatus: 200
    });
    expect(a.contentHash).toBe(b.contentHash);
  });
});

describe('excerpt', () => {
  it('leaves short text alone', () => {
    expect(excerpt('short', 100)).toBe('short');
  });

  it('truncates long text and marks it', () => {
    const result = excerpt('y'.repeat(500), 100);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('assertions', () => {
  it('builds a positive assertion with bounded evidence text', () => {
    const a = assertion('title', 'Developer', 0, 'structured-field', 1, 'z'.repeat(500));
    expect(a.value).toBe('Developer');
    expect(a.method).toBe('structured-field');
    expect(a.snapshotIndex).toBe(0);
    expect(a.text?.length).toBeLessThanOrEqual(200);
  });

  it('builds an absent assertion that is never treated as a value', () => {
    const a = absentAssertion('reward.min');
    expect(a.value).toBeNull();
    expect(a.method).toBe('absent');
    expect(a.snapshotIndex).toBeNull();
  });

  it('counts only absent assertions as unknown', () => {
    const assertions = [
      assertion('title', 'x', 0, 'structured-field', 1),
      absentAssertion('reward.min'),
      absentAssertion('reward.max')
    ];
    expect(unknownFieldCount(assertions)).toBe(2);
    expect(isEstablished(assertions, 'title')).toBe(true);
    expect(isEstablished(assertions, 'reward.min')).toBe(false);
  });
});

describe('mergeEvidence', () => {
  it('re-indexes snapshot references when combining groups', () => {
    const groupA = { snapshots: [snapshot()], assertions: [assertion('a', 1, 0, 'structured-field', 1)] };
    const groupB = { snapshots: [snapshot({ sourceId: 'remoteok' })], assertions: [assertion('b', 2, 0, 'structured-field', 1)] };
    const merged = mergeEvidence(groupA, groupB);
    expect(merged.snapshots).toHaveLength(2);
    expect(merged.assertions[0]?.snapshotIndex).toBe(0);
    expect(merged.assertions[1]?.snapshotIndex).toBe(1);
  });

  it('keeps absent assertions unindexed', () => {
    const merged = mergeEvidence({ snapshots: [snapshot()], assertions: [absentAssertion('x')] });
    expect(merged.assertions[0]?.snapshotIndex).toBeNull();
  });
});

describe('evidenceHash', () => {
  it('is stable and depends on the content hash', async () => {
    const first = await evidenceHash(snapshot());
    const second = await evidenceHash(snapshot());
    const changed = await evidenceHash(snapshot({ contentHash: 'c'.repeat(64) }));
    expect(first).toBe(second);
    expect(first).not.toBe(changed);
  });
});
