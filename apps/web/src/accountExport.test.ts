import { describe, expect, it } from 'vitest';
import { createApplicationRecord } from '@ntk/hunter-core';
import { createAccountExport } from './accountExport';

describe('private account export boundary', () => {
  it('excludes raw authentication and internal fields, including nested payment fields', () => {
    const application = createApplicationRecord({ id: 'real', opportunityId: 'real', title: 'Saved work', provider: 'Source', category: 'Development', riskLevel: 'low', rankScore: 50, sourceUrl: 'https://example.invalid/job', attribution: 'Source', now: new Date('2026-10-16') });
    const data = { profile: { primaryCountry: 'NG', accessToken: 'private-marker' }, saved: ['real'],
      applications: [{ ...application, privateKey: 'private-marker', payment: { ...application.payment, credential: 'private-marker' }, history: [{ state: application.state, at: application.updatedAt, token: 'private-marker' }] }],
      earnings: [{ id: 'payment', applicationId: 'real', paidUsd: 20, paidAt: '2026-10-16', method: null, token: 'private-marker' }],
      notifications: [{ id: 'receipt', title: 'Test', body: 'Delivered', read: false, createdAt: '2026-10-16', channel: 'telegram', status: 'delivered', internalSecret: 'private-marker' }] };
    const result = createAccountExport({ displayName: 'Owner', email: 'owner@example.invalid', refreshToken: 'private-marker' } as Parameters<typeof createAccountExport>[0], data);
    expect(JSON.stringify(result)).not.toContain('private-marker');
    expect(result.applications[0].title).toBe('Saved work');
    expect(result.earnings[0].paidUsd).toBe(20);
    expect(result.profile?.primaryCountry).toBe('NG');
  });
});
