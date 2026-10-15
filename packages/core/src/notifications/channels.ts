import { capitalStatusLabel } from '../capitalStatus.js';
import type { NotificationChannel, NotificationDecision, NotificationCandidate } from './policy.js';

/**
 * Channel adapters.
 *
 * Each one turns a decision into a provider-specific request body. Three rules
 * hold across every channel:
 *
 *  1. **No secrets, no evidence dumps.** The payload carries an id, a bounded
 *     title, a score, a link and the cost wording. It never carries a source
 *     payload, an excerpt longer than the title, or any credential.
 *  2. **No fabricated numbers.** The message states what the record states; an
 *     unpublished reward is described as unpublished, and a cost claim uses the
 *     same wording table as the app.
 *  3. **Nothing is sent here.** These functions are pure: they build requests.
 *     Delivery is a separate, injectable step so a missing provider credential
 *     cannot silently become a "sent" record.
 */

export interface NotificationMessage {
  channel: NotificationChannel;
  /** Where the message goes, resolved from the user's own stored settings. */
  destination: string;
  title: string;
  body: string;
  /** Deep link back into the app. */
  link: string;
  /** Machine-readable payload for the provider's data field. */
  data: Record<string, string>;
}

export const MAX_TITLE_CHARS = 120;
export const MAX_BODY_CHARS = 400;

function bounded(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Public app URL used for deep links; empty when not configured. */
export interface ChannelContext {
  appBaseUrl: string;
  candidate: NotificationCandidate;
  capitalLabel?: string;
}

/**
 * Compose the message body shared by every channel.
 * Deliberately short: a notification is a nudge, and the app holds the detail.
 */
export function composeMessage(context: ChannelContext): { title: string; body: string; link: string } {
  const { candidate } = context;
  const link = context.appBaseUrl
    ? `${context.appBaseUrl.replace(/\/$/, '')}/opportunities/${encodeURIComponent(candidate.opportunityId)}`
    : '';
  const cost = context.capitalLabel ?? capitalStatusLabel(candidate.capitalStatus);

  const title = bounded(candidate.title, MAX_TITLE_CHARS);
  const body = bounded(
    [
      `${candidate.provider || 'Unknown provider'} · ${candidate.category}`,
      `Rank ${candidate.rankScore}/100 · trust ${candidate.trustScore}/100`,
      cost,
      candidate.deadline ? `Deadline ${candidate.deadline}` : 'No deadline published',
      `Source: ${candidate.attribution}`
    ].join(' · '),
    MAX_BODY_CHARS
  );

  return { title, body, link };
}

export function buildNotificationMessages(params: {
  decision: NotificationDecision;
  context: ChannelContext;
  destinations: Partial<Record<NotificationChannel, string>>;
}): NotificationMessage[] {
  const { title, body, link } = composeMessage(params.context);
  const messages: NotificationMessage[] = [];

  for (const channel of params.decision.channels) {
    const destination = params.destinations[channel];
    // A channel with no resolved destination is skipped rather than guessed.
    if (!destination) continue;

    messages.push({
      channel,
      destination,
      title,
      body,
      link,
      data: {
        opportunityId: params.context.candidate.opportunityId,
        kind: params.decision.kind,
        urgency: params.decision.urgency,
        rankScore: String(params.context.candidate.rankScore),
        capitalStatus: params.context.candidate.capitalStatus,
        attribution: params.context.candidate.attribution
      }
    });
  }

  return messages;
}

// --- Transport shapes ------------------------------------------------------

/** Telegram Bot API `sendMessage` body. The token is supplied by the transport. */
export interface TelegramRequest {
  url: string;
  method: 'POST';
  body: { chat_id: string; text: string; disable_web_page_preview: true };
}

export function buildTelegramRequest(params: {
  message: NotificationMessage;
  apiBaseUrl: string;
  botId: string;
}): TelegramRequest {
  const text = params.message.link ? `${params.message.title}\n\n${params.message.body}\n\n${params.message.link}` : `${params.message.title}\n\n${params.message.body}`;
  return {
    url: `${params.apiBaseUrl.replace(/\/$/, '')}/bot${params.botId}/sendMessage`,
    method: 'POST',
    body: {
      chat_id: params.message.destination,
      text: bounded(text, 3800),
      disable_web_page_preview: true
    }
  };
}

/** Provider-neutral email request; the transport supplies the sender identity. */
export interface EmailRequest {
  url: string;
  method: 'POST';
  body: {
    from: string;
    to: string;
    subject: string;
    text: string;
  };
}

export function buildEmailRequest(params: {
  message: NotificationMessage;
  endpoint: string;
  from: string;
}): EmailRequest {
  return {
    url: params.endpoint,
    method: 'POST',
    body: {
      from: params.from,
      to: params.message.destination,
      subject: params.message.title,
      text: params.message.link ? `${params.message.body}\n\n${params.message.link}` : params.message.body
    }
  };
}

/** Web-push shape for Firebase Cloud Messaging (HTTP v1 style payload). */
export interface PushRequest {
  /** The device token registered by the PWA. */
  token: string;
  notification: { title: string; body: string };
  data: Record<string, string>;
  webpush: { fcmOptions: { link?: string } };
}

export function buildPushRequest(message: NotificationMessage): PushRequest {
  return {
    token: message.destination,
    notification: { title: message.title, body: message.body },
    data: { ...message.data, ...(message.link ? { link: message.link } : {}) },
    webpush: { fcmOptions: { ...(message.link ? { link: message.link } : {}) } }
  };
}

/**
 * Scan a composed message for anything that must never leave the server.
 * Used by tests and by the dispatcher as a last line of defence.
 */
export function findForbiddenContent(message: NotificationMessage): string[] {
  const problems: string[] = [];
  const haystack = `${message.title} ${message.body} ${JSON.stringify(message.data)}`;

  const patterns: { pattern: RegExp; label: string }[] = [
    { pattern: /bearer\s+[a-z0-9._-]{10,}/i, label: 'bearer token' },
    { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: 'private key block' },
    { pattern: /\b(seed phrase|mnemonic)\b/i, label: 'wallet secret terminology' },
    { pattern: /\bAIza[0-9A-Za-z_-]{10,}/, label: 'api key' },
    { pattern: /"private_key"\s*:/i, label: 'service account field' },
    { pattern: /^\s*\{[\s\S]*\}\s*$/, label: 'raw json payload' }
  ];

  for (const { pattern, label } of patterns) {
    if (pattern.test(haystack)) problems.push(`message contains a ${label}`);
  }

  if (message.body.length > MAX_BODY_CHARS) problems.push('message body exceeds the bounded length');
  if (message.title.length > MAX_TITLE_CHARS) problems.push('message title exceeds the bounded length');

  return problems;
}
