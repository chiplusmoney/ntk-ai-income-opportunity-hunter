/**
 * Application and outcome lifecycle, and the persisted user record shape.
 */
export {
  APPLICATION_STATES,
  ALLOWED_TRANSITIONS,
  EMPTY_PAYMENT,
  applyTransition,
  canTransition,
  createApplicationRecord,
  isTerminal,
  progressIndex,
  summariseEarnings
} from './lifecycle.js';
export type {
  ApplicationRecord,
  ApplicationState,
  EarningsSummary,
  PaymentRecord,
  TransitionRequest,
  TransitionResult
} from './lifecycle.js';
