/**
 * AI capability contracts.
 *
 * The application asks for a CAPABILITY, never a model name
 * (docs/AI_ROUTING_POLICY.md). Nothing in this folder may import a provider SDK
 * or name a model outside of the routing configuration.
 */

/** What the caller wants done. Deliberately coarse and product-shaped. */
export type TaskClass =
  | 'tagging'
  | 'summarize-opportunity'
  | 'extract-requirements'
  | 'compare-opportunities'
  | 'suspicious-pattern-review'
  | 'application-guidance'
  | 'long-context-synthesis';

export type Complexity = 'low' | 'medium' | 'high';

/**
 * Risk of the CLAIM being reasoned about. `high` means money or eligibility is
 * at stake, so deterministic evidence must be evaluated first and the model
 * output is advisory only.
 */
export type ClaimRisk = 'low' | 'medium' | 'high';

export interface CapabilityRequest {
  taskClass: TaskClass;
  complexity: Complexity;
  /** Rough input size, used to rule out models with too small a context. */
  contextTokensEstimate: number;
  /** How long the caller is willing to wait. */
  latencyBudgetMs: number;
  claimRisk: ClaimRisk;
  /** The caller needs schema-valid output it can parse and validate. */
  requiresJson: boolean;
  /**
   * Maximum the caller authorises for this call, in USD.
   * `0` means free models only, regardless of router settings.
   */
  maxCostUsd: number;
}

/** A model the router may choose. This is routing configuration, not app input. */
export interface ModelCapability {
  /** Upstream service, e.g. a router or a provider pool. Kept separate by design. */
  service: string;
  /** Opaque reference owned by that service. The app never sets this. */
  modelRef: string;
  tier: 'free' | 'paid';
  /** 1 = smallest/cheapest capable, 3 = strongest. */
  qualityTier: 1 | 2 | 3;
  supportsJson: boolean;
  maxContextTokens: number;
  avgLatencyMs: number;
  costPer1kTokensUsd: number;
  /** Task classes this model is allowed to handle. */
  capabilities: TaskClass[];
}

export interface RouterPolicy {
  /** Unconditional for this product: free models are tried first. */
  freeFirst: true;
  /** Paid use requires explicit owner authorisation. */
  paidAllowed: boolean;
  /** Lowest quality tier the caller will accept. */
  minQualityTier: 1 | 2 | 3;
  /** Hard ceiling in USD per call; 0 means free only. */
  maxCostUsd: number;
  /** Prefer lower latency when capability is otherwise equal. */
  latencyBudgetMs: number;
}

export const DEFAULT_ROUTER_POLICY: RouterPolicy = {
  freeFirst: true,
  paidAllowed: false,
  minQualityTier: 1,
  maxCostUsd: 0,
  latencyBudgetMs: 20_000
};

export interface RouteDecision {
  /** The model to call, or null when nothing eligible exists. */
  chosen: ModelCapability | null;
  /** Ordered alternatives if the chosen model fails. */
  fallbackChain: ModelCapability[];
  paidUsed: boolean;
  /**
   * Multiplier to apply to the resulting confidence, 0..1.
   * Below 1 whenever the router had to settle for a weaker model than the
   * request asked for. Applied explicitly instead of being hidden.
   */
  confidenceAdjustment: number;
  /**
   * True when deterministic evidence checks must be evaluated before any model
   * output is trusted. Set for high-risk claims.
   */
  deterministicFirst: boolean;
  reason: string;
}
