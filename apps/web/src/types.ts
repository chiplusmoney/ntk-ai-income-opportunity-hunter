import type { CapitalStatus, OpportunityCategory, RiskLevel, Tri } from '@ntk/hunter-core';

/**
 * UI view model.
 *
 * This is deliberately NOT the storage contract. The Firestore document shape
 * lives in `@ntk/hunter-core` (`PublishedOpportunity`), and the UI maps from it
 * in `repositories/mapPublishedOpportunity.ts` so a storage change cannot
 * silently change what the screens show.
 *
 * Tri-state fields keep `'unknown'`. The UI must be able to say "we could not
 * confirm this" instead of rendering a false negative.
 */

export type { CapitalStatus, OpportunityCategory, RiskLevel, Tri };

export type OpportunityStatus = 'saved' | 'applied' | 'in_progress' | 'completed' | 'rejected';

export interface EvidenceSummaryItem {
  /** The claim this line describes, e.g. "Reward" or "Country eligibility". */
  label: string;
  /** The established value, or a plain-language statement of what is missing. */
  value: string;
  /** Whether an actual value was established from a source record. */
  state: 'established' | 'unknown';
  /** How it was established: a structured field or parsed text. */
  method?: string;
}

export interface Opportunity {
  id: string;
  title: string;
  provider: string;
  category: OpportunityCategory;
  description: string;
  sourceUrl: string;
  sourceAttribution: string;
  requiresLinkBack: boolean;

  rewardMin: number | null;
  rewardMax: number | null;
  currency: string | null;
  rewardBasis: string;
  /** Display-ready pay string that never invents a number. */
  rewardText: string;

  remote: Tri;
  directPay: Tri;
  noCvRequired: Tri;
  /** Default-policy flag: true for every published record. */
  zeroCapital: boolean;
  /**
   * The cost claim as the product is allowed to state it. Never derive this in
   * a component: "no cost found" and "confirmed free" are different claims.
   */
  capitalStatus: CapitalStatus;

  countries: string[];
  skills: string[];
  requirements: string[];
  paymentMethods: string[];
  deadline: string | null;

  rankScore: number;
  trustScore: number;
  confidence: number;
  riskLevel: RiskLevel;
  evidenceCount: number;
  evidence: EvidenceSummaryItem[];

  discoveredAt: string;
  /** Relative label computed from an injected clock. */
  discoveredLabel: string;

  /**
   * Set only on the bundled UI demo rows. Real records from Firestore never
   * carry it, so the UI can label demo content as demo.
   */
  demoSeed?: true;

  status?: OpportunityStatus;
}
