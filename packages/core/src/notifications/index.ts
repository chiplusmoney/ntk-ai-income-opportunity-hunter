/**
 * Notification layer.
 *
 * `policy.ts` decides whether and how urgently something should be sent;
 * `channels.ts` turns that decision into provider-neutral requests. Neither
 * sends anything: delivery is an injectable transport, so a missing provider
 * credential can never turn into a notification that was never delivered.
 */
export {
  DEFAULT_THRESHOLDS,
  decideNotification,
  applicationStatusNotification,
  enabledChannels,
  NOTIFIABLE_APPLICATION_STATES
} from './policy.js';
export type {
  NotificationCandidate,
  NotificationChannel,
  NotificationDecision,
  NotificationKind,
  NotificationPreferences,
  NotificationThresholds,
  NotificationUrgency,
  NotifiableApplicationState
} from './policy.js';
export {
  buildNotificationMessages,
  buildTelegramRequest,
  buildEmailRequest,
  buildPushRequest,
  composeMessage,
  findForbiddenContent,
  MAX_BODY_CHARS,
  MAX_TITLE_CHARS
} from './channels.js';
export type {
  ChannelContext,
  EmailRequest,
  NotificationMessage,
  PushRequest,
  TelegramRequest
} from './channels.js';
