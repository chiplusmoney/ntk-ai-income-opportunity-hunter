import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ApplicationRecord } from '@ntk/hunter-core';
import type { EarningRecord } from './outcomes';

const state = vi.hoisted(() => ({ user: { uid: 'alice', email: 'alice@example.invalid' } as { uid: string; email: string } | null, loading: false, error: null as string | null, applications: [] as ApplicationRecord[], earnings: [] as EarningRecord[], notifications: [], profile: null }));
vi.mock('./auth/AuthProvider', () => ({ useAuth: () => ({ user: state.user, loading: false, error: null, logout: vi.fn() }) }));
vi.mock('./repositories/userData', () => ({ useUserData: () => state, deleteNotification: vi.fn(), markNotificationRead: vi.fn(), saveProfile: vi.fn(), transitionApplication: vi.fn() }));
vi.mock('./lib/firebase', () => ({ auth: null }));
import { Applications, Earnings } from './AccountPages';

beforeEach(() => { state.user = { uid: 'alice', email: 'alice@example.invalid' }; state.applications = []; state.earnings = []; state.loading = false; state.error = null; });
describe('production account pages', () => {
  it('renders honest earnings empty states without sample totals or bars', () => {
    const html = renderToStaticMarkup(<Earnings />);
    expect(html).toContain('$0.00'); expect(html).toContain('No income recorded yet');
    expect(html).toContain('—'); expect(html).not.toContain('$1,250'); expect(html).not.toContain('83%');
    expect(html).not.toContain('<meter');
  });
  it('shows an empty tracker instead of projecting catalog rows into applications', () => {
    expect(renderToStaticMarkup(<Applications />)).toContain('No applications yet');
  });
  it('renders ledger payments and real months without adding imaginary history', () => {
    state.earnings = [{ id: 'one', applicationId: 'saved-real', paidUsd: 20.5, paidAt: '2026-10-15', method: null }];
    const html = renderToStaticMarkup(<Earnings />);
    expect(html).toContain('$20.50'); expect(html).toContain('2026-10'); expect(html).not.toContain('2026-09');
  });
  it('does not present failed or loading reads as an empty earnings ledger', () => {
    state.loading = true;
    expect(renderToStaticMarkup(<Earnings />)).not.toContain('Total earned');
    state.loading = false; state.error = 'Private data unavailable';
    expect(renderToStaticMarkup(<Earnings />)).not.toContain('Total earned');
  });
  it('gates private history after sign-out', () => {
    state.user = null;
    expect(renderToStaticMarkup(<Earnings />)).toContain('Sign in with email');
    expect(renderToStaticMarkup(<Earnings />)).not.toContain('Total earned');
  });
});
