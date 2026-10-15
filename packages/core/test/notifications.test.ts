import { describe, expect, it } from 'vitest';
import {
  NOTIFIABLE_APPLICATION_STATES,
  applicationStatusNotification,
  buildEmailRequest,
  buildNotificationMessages,
  buildPushRequest,
  buildTelegramRequest,
  composeMessage,
  decideNotification,
  enabledChannels,
  findForbiddenContent
} from '../src/notifications/index.js';
import type { NotificationCandidate, NotificationPreferences } from '../src/notifications/index.js';

const NOW = new Date('2026-10-15T06:00:00.000Z');

const candidate = (overrides: Partial<NotificationCandidate> = {}): NotificationCandidate => ({
  opportunityId: 'remotive:123',
  title: 'Remote Frontend Developer',
  provider: 'Acme Ltd',
  category: 'Development',
  rankScore: 85,
  trustScore: 90,
  riskLevel: 'low',
  directPay: true,
  deadline: null,
  sourceUrl: 'https://remotive.com/remote-jobs/1',
  attribution: 'Remotive',
  capitalStatus: 'unconfirmed_no_cost_found',
  ...overrides
});

const allChannels: NotificationPreferences = { push: true, telegram: true, email: true };

describe('enabledChannels', () => {
  it('returns only what the user switched on, in priority order', () => {
    expect(enabledChannels({ push: false, telegram: true, email: true })).toEqual(['telegram', 'email']);
    expect(enabledChannels({ push: true, telegram: false, email: false })).toEqual(['push']);
    expect(enabledChannels({ push: false, telegram: false, email: false })).toEqual([]);
  });
});

describe('decideNotification', () => {
  it('sends a high-scoring, trustworthy opportunity immediately', () => {
    const decision = decideNotification({ candidate: candidate(), preferences: allChannels, now: NOW });
    expect(decision?.kind).toBe('high-value-opportunity');
    expect(decision?.urgency).toBe('immediate');
    expect(decision?.channels).toEqual(['push', 'telegram', 'email']);
  });

  it('sends nothing when every channel is switched off', () => {
    expect(
      decideNotification({ candidate: candidate(), preferences: { push: false, telegram: false, email: false }, now: NOW })
    ).toBeNull();
  });

  it('sends nothing for a critical-risk record', () => {
    expect(
      decideNotification({ candidate: candidate({ riskLevel: 'critical' }), preferences: allChannels, now: NOW })
    ).toBeNull();
  });

  it('never pushes a capital-required record as an opportunity', () => {
    expect(
      decideNotification({
        candidate: candidate({ capitalStatus: 'capital_required' }),
        preferences: allChannels,
        now: NOW
      })
    ).toBeNull();
  });

  it('holds an ordinary discovery for the digest instead of interrupting', () => {
    const decision = decideNotification({
      candidate: candidate({ rankScore: 62, trustScore: 70, directPay: false }),
      preferences: allChannels,
      now: NOW
    });
    expect(decision?.urgency).toBe('digest');
    expect(decision?.reason).toMatch(/not urgent/i);
  });

  it('escalates an imminent deadline', () => {
    const decision = decideNotification({
      candidate: candidate({
        rankScore: 60,
        directPay: false,
        deadline: new Date(NOW.getTime() + 12 * 3_600_000).toISOString()
      }),
      preferences: allChannels,
      now: NOW
    });
    expect(decision?.kind).toBe('urgent-deadline');
    expect(decision?.urgency).toBe('immediate');
  });

  it('does not notify about an opportunity whose deadline has already passed', () => {
    expect(
      decideNotification({
        candidate: candidate({ deadline: new Date(NOW.getTime() - 3_600_000).toISOString() }),
        preferences: allChannels,
        now: NOW
      })
    ).toBeNull();
  });

  it('holds a high score with weak trust for the digest', () => {
    const decision = decideNotification({
      candidate: candidate({ rankScore: 85, trustScore: 40 }),
      preferences: allChannels,
      now: NOW
    });
    // Not immediate: trust is below the immediate minimum.
    expect(decision?.urgency).toBe('digest');
  });

  it('sends nothing when the risk score is effectively blocking', () => {
    expect(
      decideNotification({ candidate: candidate({ trustScore: 20 }), preferences: allChannels, now: NOW })
    ).toBeNull();
  });

  it('escalates a strong direct-pay match just below the top band', () => {
    const decision = decideNotification({
      candidate: candidate({ rankScore: 74, trustScore: 75, directPay: true }),
      preferences: allChannels,
      now: NOW
    });
    expect(decision?.kind).toBe('strong-direct-pay');
    expect(decision?.urgency).toBe('immediate');
  });

  it('is deterministic', () => {
    const params = { candidate: candidate(), preferences: allChannels, now: NOW };
    expect(JSON.stringify(decideNotification(params))).toBe(JSON.stringify(decideNotification(params)));
  });
});

describe('application status notifications', () => {
  it('notifies on a notifiable transition', () => {
    const decision = applicationStatusNotification({
      applicationId: 'app-1',
      opportunityTitle: 'Remote Frontend Developer',
      from: 'applied',
      to: 'accepted',
      preferences: allChannels
    });
    expect(decision?.kind).toBe('application-status-change');
    expect(NOTIFIABLE_APPLICATION_STATES).toContain('paid');
  });

  it('stays silent when nothing changed or the state is not notifiable', () => {
    const base = { applicationId: 'a', opportunityTitle: 't', preferences: allChannels };
    expect(applicationStatusNotification({ ...base, from: 'saved', to: 'saved' })).toBeNull();
    expect(applicationStatusNotification({ ...base, from: 'saved', to: 'applied' })).toBeNull();
  });

  it('stays silent when the user has no channels enabled', () => {
    expect(
      applicationStatusNotification({
        applicationId: 'a',
        opportunityTitle: 't',
        from: 'applied',
        to: 'paid',
        preferences: { push: false, telegram: false, email: false }
      })
    ).toBeNull();
  });
});

describe('message composition', () => {
  const decision = {
    kind: 'high-value-opportunity' as const,
    urgency: 'immediate' as const,
    reason: 'test',
    channels: ['push', 'telegram', 'email'] as const
  };

  const context = {
    appBaseUrl: 'https://app.example',
    candidate: candidate()
  };

  it('keeps the title and body bounded', () => {
    const message = composeMessage(context);
    expect(message.title.length).toBeLessThanOrEqual(120);
    expect(message.body.length).toBeLessThanOrEqual(400);
  });

  it('uses the shared cost wording instead of a stronger claim', () => {
    const message = composeMessage(context);
    expect(message.body).toMatch(/No upfront cost found/i);
    expect(message.body).not.toMatch(/Confirmed \$0/);
  });

  it('states when no deadline was published rather than omitting it silently', () => {
    expect(composeMessage(context).body).toMatch(/No deadline published/);
  });

  it('links back into the app', () => {
    expect(composeMessage(context).link).toBe('https://app.example/opportunities/remotive%3A123');
  });

  it('omits the link when no app URL is configured', () => {
    expect(composeMessage({ ...context, appBaseUrl: '' }).link).toBe('');
  });

  it('builds one message per enabled channel with a resolved destination', () => {
    const messages = buildNotificationMessages({
      decision: { ...decision, channels: ['push', 'telegram', 'email'] },
      context,
      destinations: { push: 'device-token', telegram: 'chat-1' }
    });
    expect(messages.map(m => m.channel)).toEqual(['push', 'telegram']);
    // Email had no destination, so it is skipped rather than guessed.
    expect(messages.some(m => m.channel === 'email')).toBe(false);
  });

  it('carries the cost status in the machine-readable payload', () => {
    const [message] = buildNotificationMessages({
      decision: { ...decision, channels: ['push'] },
      context,
      destinations: { push: 'device-token' }
    });
    expect(message?.data.capitalStatus).toBe('unconfirmed_no_cost_found');
    expect(message?.data.attribution).toBe('Remotive');
  });

  it('never leaks a secret, a raw payload or a wallet phrase', () => {
    const messages = buildNotificationMessages({
      decision: { ...decision, channels: ['push', 'telegram', 'email'] },
      context,
      destinations: { push: 't', telegram: 'c', email: 'a@b.test' }
    });
    for (const message of messages) {
      expect(findForbiddenContent(message)).toEqual([]);
    }
  });

  it('detects forbidden content when it is present', () => {
    const dirty = {
      channel: 'push' as const,
      destination: 't',
      title: 'alert',
      body: 'Authorization: Bearer abcdefghijklmnop',
      link: '',
      data: {}
    };
    expect(findForbiddenContent(dirty).join(' ')).toMatch(/bearer token/i);
  });
});

describe('transport shapes', () => {
  const message = {
    channel: 'telegram' as const,
    destination: 'chat-1',
    title: 'Remote Frontend Developer',
    body: 'Acme Ltd · Development · Rank 85/100',
    link: 'https://app.example/opportunities/x',
    data: { opportunityId: 'remotive:123' }
  };

  it('builds a Telegram sendMessage request without the token in the body', () => {
    const request = buildTelegramRequest({
      message,
      apiBaseUrl: 'https://api.telegram.org',
      botId: 'bot-identifier'
    });
    expect(request.url).toBe('https://api.telegram.org/botbot-identifier/sendMessage');
    expect(request.body.chat_id).toBe('chat-1');
    expect(JSON.stringify(request.body)).not.toMatch(/bot-identifier/);
    expect(request.body.text).toContain('https://app.example');
  });

  it('builds an email request to a provider HTTP endpoint', () => {
    const emailMessage = { ...message, channel: 'email' as const, destination: 'user@example.test' };
    const request = buildEmailRequest({
      message: emailMessage,
      endpoint: 'https://mail.example/send',
      from: 'hunter@example.test'
    });
    expect(request.body.to).toBe('user@example.test');
    expect(request.body.subject).toBe('Remote Frontend Developer');
    expect(request.method).toBe('POST');
  });

  it('builds a push payload keyed by the device token', () => {
    const pushMessage = { ...message, channel: 'push' as const, destination: 'device-token-1' };
    const request = buildPushRequest(pushMessage);
    expect(request.token).toBe('device-token-1');
    expect(request.notification.title).toBe('Remote Frontend Developer');
    expect(request.webpush.fcmOptions.link).toBe('https://app.example/opportunities/x');
  });
});
