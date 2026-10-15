import type {
  CapabilityRequest,
  ModelCapability,
  RouteDecision,
  RouterPolicy
} from './capability.js';
import { DEFAULT_ROUTER_POLICY } from './capability.js';

/**
 * Capability router.
 *
 * Order of operations, exactly as the product policy states it:
 *
 *   1. A candidate must be able to do the task, fit the context, and speak JSON
 *      when the caller needs it.
 *   2. Free models that meet the quality threshold are tried first, least
 *      capable/cheapest first — "use the least expensive capable FREE model".
 *   3. Stronger free models are used only when the cheaper ones cannot meet the
 *      threshold.
 *   4. Paid models are considered only when `paidAllowed` is true, the caller's
 *      own ceiling allows it, and no free model met the threshold.
 *   5. If paid is unavailable, the best eligible free model is used anyway and
 *      `confidenceAdjustment` is reduced explicitly rather than silently.
 *   6. If nothing is eligible, `chosen` is null. The deterministic hunter does
 *      not depend on this module, so a null route is a normal, survivable state.
 *
 * The router never names a model for the caller: it returns a decision the
 * calling service turns into a request. FlagshipRouter owns the actual call.
 */

function meetsTaskRequirements(model: ModelCapability, request: CapabilityRequest): boolean {
  if (!model.capabilities.includes(request.taskClass)) return false;
  if (request.requiresJson && !model.supportsJson) return false;
  if (model.maxContextTokens < request.contextTokensEstimate) return false;
  return true;
}

/** Cheapest-capable-first ordering for free models: weaker tier first, then faster. */
function freeOrder(a: ModelCapability, b: ModelCapability): number {
  if (a.qualityTier !== b.qualityTier) return a.qualityTier - b.qualityTier;
  if (a.avgLatencyMs !== b.avgLatencyMs) return a.avgLatencyMs - b.avgLatencyMs;
  return a.modelRef.localeCompare(b.modelRef);
}

/** Cheapest-capable-first ordering for paid models: lowest price first. */
function paidOrder(a: ModelCapability, b: ModelCapability): number {
  if (a.costPer1kTokensUsd !== b.costPer1kTokensUsd) return a.costPer1kTokensUsd - b.costPer1kTokensUsd;
  if (a.qualityTier !== b.qualityTier) return a.qualityTier - b.qualityTier;
  return a.modelRef.localeCompare(b.modelRef);
}

function withinLatency(model: ModelCapability, request: CapabilityRequest): boolean {
  // A model slower than the budget is allowed only if nothing else can do the job;
  // it is ordered last rather than excluded.
  return model.avgLatencyMs <= Math.max(request.latencyBudgetMs, 1);
}

export function selectRoute(
  request: CapabilityRequest,
  candidates: readonly ModelCapability[],
  policy: RouterPolicy = DEFAULT_ROUTER_POLICY
): RouteDecision {
  const deterministicFirst = request.claimRisk === 'high';
  const eligible = candidates.filter(model => meetsTaskRequirements(model, request));

  if (eligible.length === 0) {
    return {
      chosen: null,
      fallbackChain: [],
      paidUsed: false,
      confidenceAdjustment: 0,
      deterministicFirst,
      reason: 'No eligible model for this capability; continue deterministically without AI.'
    };
  }

  const free = eligible.filter(model => model.tier === 'free').sort(freeOrder);
  const paid = eligible.filter(model => model.tier === 'paid').sort(paidOrder);

  const freeMeetsThreshold = free.filter(model => model.qualityTier >= policy.minQualityTier);
  const freeWithinLatency = freeMeetsThreshold.filter(model => withinLatency(model, request));
  const freePreferred = freeWithinLatency.length ? freeWithinLatency : freeMeetsThreshold;

  if (freePreferred.length > 0) {
    const [chosen, ...rest] = freePreferred;
    return {
      chosen: chosen ?? null,
      fallbackChain: [...rest, ...free.filter(model => !freePreferred.includes(model))],
      paidUsed: false,
      confidenceAdjustment: 1,
      deterministicFirst,
      reason: `Free model meeting quality tier ${policy.minQualityTier} selected first, as required by the free-first policy.`
    };
  }

  // No free model met the threshold. Can we pay?
  const affordablePaid = paid.filter(model => model.costPer1kTokensUsd <= request.maxCostUsd);
  const paidAllowed = policy.paidAllowed && request.maxCostUsd > 0 && policy.maxCostUsd > 0;

  if (paidAllowed && affordablePaid.length > 0) {
    const [chosen, ...rest] = affordablePaid;
    return {
      chosen: chosen ?? null,
      fallbackChain: [...rest, ...free],
      paidUsed: true,
      confidenceAdjustment: 1,
      deterministicFirst,
      reason: `No free model met quality tier ${policy.minQualityTier}; using the least-cost paid model the caller authorised.`
    };
  }

  // Paid unavailable or disallowed: fall back to the best free model that exists
  // and reduce confidence explicitly rather than pretending capability.
  const bestFree = [...free].sort(
    (a, b) => b.qualityTier - a.qualityTier || a.avgLatencyMs - b.avgLatencyMs
  );
  const [chosen, ...rest] = bestFree;

  return {
    chosen: chosen ?? null,
    fallbackChain: rest,
    paidUsed: false,
    confidenceAdjustment: 0.7,
    deterministicFirst,
    reason: paidAllowed
      ? 'Paid models were authorised but none were affordable within the caller ceiling; using the strongest free model and lowering confidence.'
      : 'No free model met the required quality tier and paid use is not authorised; using the strongest free model and lowering confidence explicitly.'
  };
}

/** Convenience: does this decision require an explicit confidence reduction? */
export function reducesConfidence(decision: RouteDecision): boolean {
  return decision.confidenceAdjustment < 1;
}
