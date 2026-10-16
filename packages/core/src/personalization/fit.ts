import type { CapitalStatus, Tri } from '../types.js';
import type { ApplicationRecord } from '../applications/lifecycle.js';
import type { EarningProfile } from './profile.js';
import type { ProofRecord } from './proof.js';

export interface FitOpportunity {
  id: string; title: string; category: string; description: string; requirements: string[]; skills: string[];
  countries: string[]; remote: Tri; directPay: Tri; noCvRequired: Tri; capitalStatus: CapitalStatus;
  paymentMethods: string[]; deadline: string | null; rewardMin: number | null; rewardMax: number | null;
  currency: string | null; rewardBasis: string; rankScore: number; confidence: number; riskLevel: string; discoveredAt: string;
}
export type RequirementState = 'confirmed-not-required' | 'required' | 'unknown';
export interface EntryPath {
  cv: RequirementState; portfolio: RequirementState; beginner: Tri; skillsTest: Tri; directTask: Tri;
  paidTraining: Tri; bounty: Tri; researchTesting: Tri; quickApplication: Tri;
}

/** Explicit positive statements only. Contradictory requirements resolve conservatively to required/unknown. */
export function entryPath(o: FitOpportunity): EntryPath {
  const t = `${o.requirements.join('\n')}\n${o.description}`.replace(/<[^>]*>/g, ' ').toLowerCase();
  const requirement = (noun: string): RequirementState => {
    const positiveOnly = t.replace(new RegExp(`no\\s+${noun}\\s+(?:is\\s+)?(?:required|needed)|${noun}\\s+(?:is\\s+)?not\\s+required`, 'g'), '');
    const required = new RegExp(`(?:must (?:have|submit|provide)|submit (?:your|a)|upload (?:your|a)|required:?|requires? (?:a|your))\\s+${noun}|${noun}\\s+(?:is\\s+)?required\\b`).test(positiveOnly);
    const absent = new RegExp(`no\\s+${noun}\\s+(?:is\\s+)?(?:required|needed)|${noun}\\s+(?:is\\s+)?not\\s+required`).test(t);
    return required ? 'required' : absent ? 'confirmed-not-required' : 'unknown';
  };
  const portfolio = requirement('portfolio');
  const explicitCv = requirement('(?:cv|resume|résumé)');
  return { cv: explicitCv === 'required' || o.noCvRequired === false ? 'required' : o.noCvRequired === true || explicitCv === 'confirmed-not-required' ? 'confirmed-not-required' : 'unknown', portfolio,
    beginner: /no (?:prior )?experience (?:is )?required|beginners? (?:are )?welcome|entry.level/.test(t) && !/not (?:for )?beginners|senior|[3-9]\+? years/.test(t) ? true : 'unknown',
    skillsTest: /(?:skills? test|coding challenge|work sample) (?:is )?(?:accepted|instead of|can replace)/.test(t) ? true : 'unknown',
    directTask: /(?:single|one.off|paid) task|fixed.price (?:task|project)/.test(t) ? true : 'unknown',
    paidTraining: /paid (?:training|evaluation|trial)/.test(t) && !/(?:unpaid|not paid|pay for training)/.test(t) ? true : 'unknown',
    bounty: o.category === 'Bounty' ? true : 'unknown', researchTesting: ['Research', 'Testing'].includes(o.category) && o.directPay === true ? true : 'unknown',
    quickApplication: /(?:apply|application) (?:in |takes? )?(?:under |less than )?[1-5] minutes?|one.click apply/.test(t) ? true : 'unknown' };
}

export interface LearningState { enabled: boolean; resetAt: string | null }
export interface LearningAdjustment { points: number; reasons: string[] }

/** Derived from actual owner records, never synthetic click/ignore inference. Max +/-6 points. */
export function outcomeLearning(category: string, applications: readonly ApplicationRecord[], state: LearningState): LearningAdjustment {
  if (!state.enabled) return { points: 0, reasons: ['Recommendation learning is disabled'] };
  const rows = applications.filter(a => a.category === category && (!state.resetAt || a.history.some(h => h.at > state.resetAt!)));
  const positive = rows.filter(a => ['accepted', 'in_progress', 'submitted', 'paid'].includes(a.state)).length;
  const rejected = rows.filter(a => a.state === 'rejected').length;
  const applied = rows.filter(a => a.appliedAt && (!state.resetAt || a.appliedAt > state.resetAt)).length;
  const points = Math.max(-6, Math.min(6, positive * 2 + Math.min(2, applied) - rejected));
  return { points, reasons: rows.length ? [`${category}: ${positive} accepted/active/paid, ${applied} applied, ${rejected} rejected since learning reset (${points >= 0 ? '+' : ''}${points} points)`] : ['No recorded outcomes for this category since learning reset'] };
}

export interface PersonalFit {
  score: number; eligible: 'confirmed' | 'blocked' | 'unknown'; reasons: string[]; unknowns: string[]; risks: string[];
  matchedSkills: string[]; missingSkills: string[]; proofIds: string[]; requiredProof: string[]; friction: string;
  nextAction: string; learning: LearningAdjustment; path: EntryPath; components: { key: string; points: number; maximum: number }[];
}
const key = (s: string) => s.trim().toLowerCase();

/** v1: fixed denominator; unknowns contribute zero. This is compatibility, never probability of acceptance. */
export function personalFit(o: FitOpportunity, p: EarningProfile, proofs: readonly ProofRecord[], applications: readonly ApplicationRecord[], learningState: LearningState, now: Date): PersonalFit {
  const reasons: string[] = [], unknowns: string[] = [], risks: string[] = [], requiredProof: string[] = [];
  const components: PersonalFit['components'] = [];
  const add = (k: string, n: number, max: number) => components.push({ key: k, points: n, maximum: max });
  const path = entryPath(o);
  const matchedSkills = o.skills.filter(s => p.skills.some(x => key(x) === key(s)));
  const missingSkills = o.skills.filter(s => !matchedSkills.includes(s));
  const eligibleProofs = proofs.filter(proof => proof.status !== 'incomplete');
  const proofIds = eligibleProofs.filter(proof => proof.skills.some(s => matchedSkills.some(m => key(s) === key(m)))).map(proof => proof.id);
  let eligible: PersonalFit['eligible'] = 'unknown';
  const countries = o.countries.map(c => c.toUpperCase());
  if (!countries.length || !p.country) unknowns.push('Country eligibility unconfirmed');
  else if (countries.includes('GLOBAL') || countries.includes(p.country)) { eligible = 'confirmed'; reasons.push(countries.includes('GLOBAL') ? 'Source lists worldwide availability; check any work-authorization requirements' : `Source lists ${p.country}; confirm work authorization`); }
  else { eligible = 'blocked'; risks.push('Your stated country is outside the listed locations'); }
  add('location', eligible === 'confirmed' ? 20 : 0, 20);
  add('skills', o.skills.length ? 30 * matchedSkills.length / o.skills.length : 0, 30);
  if (!o.skills.length) unknowns.push('Required skills not structured by the source');
  else reasons.push(`${matchedSkills.length} of ${o.skills.length} listed skills match your declared skills`);
  add('category', p.categories.includes(o.category) ? 10 : 0, 10);
  if (p.categories.includes(o.category)) reasons.push('Matches a preferred work category');
  add('capital', o.capitalStatus === 'confirmed_free' ? 10 : 0, 10);
  if (o.capitalStatus === 'confirmed_free') reasons.push('Source confirms no upfront capital');
  else if (o.capitalStatus === 'capital_required') { eligible = 'blocked'; risks.push('Upfront capital required'); }
  else unknowns.push('No upfront cost found; zero cost is unconfirmed');
  add('format', p.remoteOnly ? o.remote === true ? 5 : 0 : o.remote !== 'unknown' ? 5 : 0, 5);
  if (p.remoteOnly && o.remote === false) { eligible = 'blocked'; risks.push('On-site work conflicts with your remote-only preference'); }
  if (o.remote === 'unknown') unknowns.push('Remote work unconfirmed');
  add('payment', o.paymentMethods.length && o.paymentMethods.some(m => p.paymentMethods.some(pm => key(m) === key(pm))) ? 5 : 0, 5);
  if (!o.paymentMethods.length || !p.paymentMethods.length) unknowns.push('Payment method compatibility unconfirmed');
  else if (!o.paymentMethods.some(m => p.paymentMethods.some(pm => key(m) === key(pm)))) risks.push('No declared payment method matches the source');
  const cvReady = path.cv === 'confirmed-not-required' || path.cv === 'required' && p.cv === 'available';
  const portfolioReady = path.portfolio === 'confirmed-not-required' || path.portfolio === 'required' && p.portfolio === 'available';
  add('documents', (cvReady ? 3 : 0) + (portfolioReady ? 3 : 0), 6);
  if (path.cv === 'unknown') unknowns.push('CV requirement unknown');
  if (path.portfolio === 'unknown') unknowns.push('Portfolio requirement unknown');
  if (path.cv === 'required' && p.cv !== 'available') requiredProof.push('CV / resume requested by the source');
  if (path.portfolio === 'required' && p.portfolio !== 'available') requiredProof.push('Portfolio requested by the source');
  add('proof', Math.min(4, proofIds.length * 2), 4);
  if (proofIds.length) reasons.push(`${proofIds.length} real proof record(s) cover matching skills; provenance remains visible`);
  const text = `${o.title} ${o.requirements.join(' ')} ${o.description}`.toLowerCase();
  const senior = /\bsenior\b|\b[5-9]\+? years/.test(text);
  const beginner = path.beginner === true;
  const experienceMatch = senior && p.experience === 'senior' || beginner && p.experience !== 'unknown';
  add('experience', experienceMatch ? 5 : 0, 5);
  if (senior && ['none', 'junior'].includes(p.experience)) risks.push('Experience requirement exceeds your stated level');
  if (!senior && !beginner) unknowns.push('Experience compatibility requires checking the full source');
  add('reward', o.currency && p.currencies.includes(o.currency) && o.rewardMin !== null && (p.minimumReward === null || o.rewardBasis === p.rewardBasis && o.rewardMin >= p.minimumReward) ? 5 : 0, 5);
  if (o.rewardMin === null || !o.currency) unknowns.push('Advertised reward or currency unknown');
  if (p.minimumReward !== null && (o.rewardBasis !== p.rewardBasis || !o.currency || !p.currencies.includes(o.currency))) unknowns.push('Minimum reward cannot be compared across currency or payment period');
  if (o.deadline && Date.parse(o.deadline) <= now.getTime()) { eligible = 'blocked'; risks.push('Source deadline has passed'); }
  else if (o.deadline && Date.parse(o.deadline) - now.getTime() < 3 * 86400000) risks.push('Deadline is near');
  else if (!o.deadline) unknowns.push('Deadline unknown');
  if (o.deadline && p.deadlineDays !== null && Date.parse(o.deadline) - now.getTime() < p.deadlineDays*86400000) risks.push('Less preparation time than your preferred deadline tolerance');
  if (o.riskLevel !== 'low') risks.push(`Source risk assessment: ${o.riskLevel}`);
  if (p.excludedCategories.includes(o.category) || p.competitionTolerance === 'avoid' && o.category === 'Competition') { eligible = 'blocked'; risks.push('Excluded by your preferences'); }
  unknowns.push('Language, devices, work duration and competition intensity require source confirmation');
  const learning = outcomeLearning(o.category, applications, learningState);
  let score = Math.round(components.reduce((n,c) => n + c.points, 0) + learning.points);
  score = eligible === 'blocked' ? 0 : Math.max(0, Math.min(100, score));
  const friction = path.quickApplication === true ? 'Quick application stated by source' : 'Application effort unknown; review official steps';
  const nextAction = eligible === 'blocked' ? 'Resolve the stated eligibility or preference conflict before applying' : requiredProof.length ? 'Prepare the requested documents from genuine evidence' : missingSkills.length ? 'Check essential skill gaps and choose relevant proof' : 'Review unknowns on the official source, then prepare your application';
  return { score, eligible, reasons, unknowns, risks, matchedSkills, missingSkills, proofIds, requiredProof, friction, nextAction, learning, path, components };
}

export const RECOMMENDATION_VIEWS = ['Best matches for you', 'Start today', 'No CV / portfolio path', 'Confirmed $0 upfront', 'Direct paid work', 'Quick applications', 'Highest fit', 'Highest verified reward', 'Expiring soon', 'Needs proof', 'Skills gap', 'Saved', 'Applied', 'Recently discovered'] as const;
export type RecommendationView = typeof RECOMMENDATION_VIEWS[number];
export function selectRecommendations<T extends FitOpportunity>(rows: readonly T[], fits: ReadonlyMap<string, PersonalFit>, view: RecommendationView, applications: readonly ApplicationRecord[], now: Date): T[] {
  const states = new Map(applications.map(a => [a.opportunityId, a.state]));
  const filtered = rows.filter(o => {
    const f = fits.get(o.id); if (!f) return false;
    if (view === 'Saved') return states.has(o.id);
    if (view === 'Applied') return applications.some(a => a.opportunityId === o.id && a.appliedAt !== null);
    if (f.eligible === 'blocked') return false;
    if (view === 'Start today') return !f.requiredProof.length && f.missingSkills.length === 0;
    if (view === 'No CV / portfolio path') return f.path.cv === 'confirmed-not-required' && f.path.portfolio === 'confirmed-not-required';
    if (view === 'Confirmed $0 upfront') return o.capitalStatus === 'confirmed_free';
    if (view === 'Direct paid work') return o.directPay === true;
    if (view === 'Quick applications') return f.path.quickApplication === true;
    if (view === 'Highest verified reward') return o.currency !== null && (o.rewardMin !== null || o.rewardMax !== null);
    if (view === 'Expiring soon') return !!o.deadline && Date.parse(o.deadline) > now.getTime() && Date.parse(o.deadline) - now.getTime() <= 7 * 86400000;
    if (view === 'Needs proof') return f.requiredProof.length > 0;
    if (view === 'Skills gap') return f.missingSkills.length > 0;
    return true;
  });
  return filtered.sort((a,b) => view === 'Recently discovered' ? b.discoveredAt.localeCompare(a.discoveredAt) : view === 'Expiring soon' ? String(a.deadline).localeCompare(String(b.deadline)) : view === 'Highest verified reward' ? `${a.currency}/${a.rewardBasis}`.localeCompare(`${b.currency}/${b.rewardBasis}`) || (b.rewardMin ?? b.rewardMax ?? 0) - (a.rewardMin ?? a.rewardMax ?? 0) : (fits.get(b.id)?.score ?? 0) - (fits.get(a.id)?.score ?? 0) || b.rankScore - a.rankScore || a.id.localeCompare(b.id));
}
