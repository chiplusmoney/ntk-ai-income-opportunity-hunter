/**
 * AI routing layer.
 *
 * The application asks for a capability, never a model name. The deterministic
 * hunter does not import anything here on its critical path: if every model and
 * router is unavailable, `runHunt` still produces verified opportunities.
 *
 * Boundary: FlagshipRouter is the control brain; FreeLLMAPI is an independent
 * provider pool. They share types and nothing else.
 */
export type {
  CapabilityRequest,
  ModelCapability,
  RouteDecision,
  RouterPolicy,
  TaskClass,
  Complexity,
  ClaimRisk
} from './capability.js';
export { DEFAULT_ROUTER_POLICY } from './capability.js';
export { selectRoute, reducesConfidence } from './router.js';
export { poolCandidates, buildPoolRequest } from './freeLlmApi.js';
export type { ProviderPoolEntry, PoolSnapshot, PoolCompletionRequest, PoolCompletionResponse } from './freeLlmApi.js';
export {
  buildAnalysisInput,
  validateAnalysis,
  applyAnalysis,
  aiIsOptional,
  EVIDENCE_OWNED_FIELDS,
  MAX_RANK_ADJUSTMENT
} from './analysis.js';
export type {
  AiAnalysisPayload,
  AnalysisInput,
  AnalysisValidation,
  AnalysisEvidenceRef,
  AppliedAnalysis,
  ModelMetadata
} from './analysis.js';
