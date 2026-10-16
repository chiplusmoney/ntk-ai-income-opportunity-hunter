import type { EarningProfile } from './profile.js';
import type { ProofRecord } from './proof.js';
import type { FitOpportunity, PersonalFit } from './fit.js';
import { capitalStatusLabel } from '../capitalStatus.js';

export type AssistanceCapability = 'explanation' | 'cover-note' | 'short-pitch' | 'proposal' | 'application-answers' | 'professional-introduction' | 'proof-summary' | 'skill-gap' | 'comparison' | 'action-plan';
export interface GroundedFact { id: string; kind: 'source fact' | 'user fact'; text: string }
export interface GroundedDraft { capability: AssistanceCapability; opening: string; facts: GroundedFact[]; suggestions: string[]; mode: 'deterministic' | 'ai-assisted'; warning: string }
export const SAFE_SUGGESTIONS = ['Review the official application instructions.', 'Confirm eligibility and payment terms before applying.', 'Attach only proof of work you personally performed.', 'Ask the source to clarify missing requirements.', 'Review this draft and answer outstanding questions in your own words.'] as const;

/** No free-form model prose enters a draft. Providers select fact IDs and approved suggestions.
 * This deliberately trades stylistic freedom for an enforceable no-invented-qualifications boundary. */
export interface M6AssistantAdapter {
  service: 'FlagshipRouter';
  complete(input: { capability: AssistanceCapability; facts: GroundedFact[]; allowedSuggestions: readonly string[]; paidAllowed: false; maxCostUsd: 0; signal?: AbortSignal }): Promise<unknown>;
}
export function applicationFacts(o: FitOpportunity, p: EarningProfile, proofs: readonly ProofRecord[]): GroundedFact[] {
  return [
    { id: 'source:title', kind: 'source fact' as const, text: `Opportunity: ${o.title}` },
    { id: 'source:requirements', kind: 'source fact' as const, text: o.requirements.length ? `Source requirements: ${o.requirements.join('; ')}` : 'Requirements not structured; consult the official source.' },
    { id: 'source:skills', kind: 'source fact' as const, text: o.skills.length ? `Skills listed by the source: ${o.skills.join(', ')}` : 'Listed skills unknown.' },
    { id: 'source:location', kind: 'source fact' as const, text: o.countries.length ? `Locations listed by the source: ${o.countries.join(', ')}. Work authorization must still be checked.` : 'Location eligibility unknown.' },
    { id: 'source:capital', kind: 'source fact' as const, text: capitalStatusLabel(o.capitalStatus,'long') },
    ...(p.skills.length ? [{ id: 'user:skills', kind: 'user fact' as const, text: `My declared skills: ${p.skills.join(', ')}` }] : []),
    ...(p.experience !== 'unknown' ? [{ id: 'user:experience', kind: 'user fact' as const, text: `My declared experience level: ${p.experience}` }] : []),
    ...proofs.filter(x => x.status !== 'incomplete').map(x => ({ id: `proof:${x.id}`, kind: 'user fact' as const, text: `${x.title}: ${x.description} [${x.status}; ${x.provenance}]` }))
  ];
}
/** Suggested boilerplate contains no qualification, eligibility, reward or outcome claims.
 * The only interpolated text is the existing source-title fact. All qualifications remain cited verbatim below it. */
export function draftOpening(capability: AssistanceCapability,title: string): string {
  const templates: Record<AssistanceCapability,string> = {
    'cover-note': `Hello, I am interested in “${title}”. Please review my declared background and genuine evidence below. I would like to clarify any unanswered requirements before proceeding.`,
    'short-pitch': `For “${title}”, here is the genuine background and evidence I can currently share. Please confirm the requirements that remain unanswered.`,
    proposal: `Proposal outline for “${title}”: clarify the requirements, identify relevant evidence, and agree scope, timing and payment before beginning. Specific commitments still need to be discussed.`,
    'application-answers': `Answer preparation for “${title}”: use the cited facts below. Questions not covered by those facts still require your own truthful answers.`,
    'professional-introduction': `Hello, here is my declared background and supporting evidence for your consideration regarding “${title}”.`,
    'proof-summary': `Evidence summary for “${title}”: the selected records below retain their original provenance. A project record does not independently verify every requested skill.`,
    explanation: `Review “${title}” using the source facts and your declared background below, alongside the deterministic fit explanation.`,
    'skill-gap': `For “${title}”, compare the source-listed skills with your declared skills below. Unlisted or unproved skills must not be claimed.`,
    comparison: `Comparison notes for “${title}”: use the same evidence fields for each listing. Do not compare rewards across different currencies or payment periods.`,
    'action-plan': `Next steps for “${title}”: clarify missing requirements, prepare genuine proof, review the official application steps, and record only actions actually completed.`
  };
  return templates[capability];
}
export function validateGroundedSelection(raw: unknown, facts: readonly GroundedFact[]): { ok: boolean; selected: GroundedFact[]; suggestions: string[] } {
  if (!raw || typeof raw !== 'object') return { ok: false, selected: [], suggestions: [] };
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).some(k => !['factIds', 'suggestions'].includes(k)) || !Array.isArray(r.factIds) || !Array.isArray(r.suggestions) || r.factIds.length > 100 || r.suggestions.length > 5) return { ok: false, selected: [], suggestions: [] };
  const known = new Map(facts.map(f => [f.id, f]));
  if (!r.factIds.every(id => typeof id === 'string' && known.has(id)) || !r.suggestions.every(s => SAFE_SUGGESTIONS.includes(s as typeof SAFE_SUGGESTIONS[number]))) return { ok: false, selected: [], suggestions: [] };
  return { ok: true, selected: [...new Set(r.factIds as string[])].map(id => known.get(id)!), suggestions: [...new Set(r.suggestions as string[])] };
}
export async function assistApplication(capability: AssistanceCapability, o: FitOpportunity, p: EarningProfile, proofs: readonly ProofRecord[], adapter?: M6AssistantAdapter): Promise<GroundedDraft> {
  const facts = applicationFacts(o,p,proofs);
  const base: GroundedDraft = { capability, opening:draftOpening(capability,o.title), facts, suggestions: [...SAFE_SUGGESTIONS], mode: 'deterministic', warning: 'Evidence-based preparation draft. Unanswered requirements remain unanswered. Review before copying or submitting; nothing is sent automatically.' };
  if (!adapter) return base;
  try {
    const selected = validateGroundedSelection(await adapter.complete({ capability, facts, allowedSuggestions: SAFE_SUGGESTIONS, paidAllowed: false, maxCostUsd: 0, signal: AbortSignal.timeout(8000) }), facts);
    return selected.ok ? { ...base, facts: selected.selected, suggestions: selected.suggestions, mode: 'ai-assisted' } : base;
  } catch { return base; }
}
export function applicationChecklist(o: FitOpportunity, f: PersonalFit): { label: string; kind: 'source fact' | 'user fact' | 'suggested action'; done: boolean }[] {
  return [
    { label: 'Review country and work authorization on the official source', kind: 'suggested action', done: false },
    ...o.requirements.map(label => ({ label, kind: 'source fact' as const, done: false })),
    ...f.requiredProof.map(label => ({ label, kind: 'source fact' as const, done: false })),
    ...f.proofIds.map(id => ({ label: `Consider attaching proof ${id}; review its provenance`, kind: 'user fact' as const, done: false })),
    ...f.unknowns.map(label => ({ label: `Clarify: ${label}`, kind: 'suggested action' as const, done: false })),
    { label: 'Apply through the official link and record Applied only after submitting', kind: 'suggested action', done: false }
  ];
}
