import { describe,it,expect } from 'vitest';
import { EMPTY_EARNING_PROFILE, DEFAULT_PERSONAL_NOTIFICATION_POLICY, validateEarningProfile, earningProfileFromLegacy, profileCompletion, validateDeclaredProof, proofCard, readProofRecord,
  personalFit, entryPath, selectRecommendations, createApplicationRecord, applyTransition, outcomeLearning, assistApplication, validateGroundedSelection, applicationFacts, applicationChecklist,
  personalizedNotices, noticeAllowed, inQuietHours, earningActions, type EarningProfile, type FitOpportunity, type ProofRecord } from '../src/index.js';
const now = new Date('2026-10-16T12:00:00Z');
const opportunity = (overrides: Partial<FitOpportunity> = {}): FitOpportunity => ({ id:'real:1',title:'Developer',category:'Development',description:'Build a site',requirements:[],skills:['React'],countries:['GLOBAL'],remote:true,directPay:true,noCvRequired:'unknown',capitalStatus:'unconfirmed_no_cost_found',paymentMethods:[],deadline:null,rewardMin:null,rewardMax:null,currency:null,rewardBasis:'unknown',rankScore:80,confidence:60,riskLevel:'low',discoveredAt:now.toISOString(),...overrides });
const profile = (overrides: Partial<EarningProfile> = {}): EarningProfile => ({ ...EMPTY_EARNING_PROFILE,country:'NG',skills:['React'],...overrides });
const proof: ProofRecord = { id:'proof1',title:'My real project',kind:'code',description:'I built the UI',skills:['React'],url:'https://github.com/example/repo',provenance:'My own recorded project',status:'user-declared',sourceIds:[],createdAt:now.toISOString(),updatedAt:now.toISOString() };
const learning = { enabled:false,resetAt:null };
const fit = (o = opportunity(),p = profile(),proofs: ProofRecord[] = []) => personalFit(o,p,proofs,[],learning,now);
const application = () => createApplicationRecord({ id:'real:1',opportunityId:'real:1',title:'Developer',provider:'Example',category:'Development',riskLevel:'low',rankScore:80,sourceUrl:'https://example.com/job',attribution:'Example',now });

describe('earning profile migration and validation',() => {
  it('allows a minimal profile with no CV or portfolio',() => { const r = validateEarningProfile({ cv:'none',portfolio:'none' }); expect(r.ok).toBe(true); expect(r.value.skills).toEqual([]); });
  it('does not invent unanswered skills or payment availability',() => { expect(validateEarningProfile({}).value).toEqual(EMPTY_EARNING_PROFILE); expect(profileCompletion(EMPTY_EARNING_PROFILE).answered).toBe(0); });
  it('migrates old actual country and skills without creating document availability',() => { const p = earningProfileFromLegacy({ primaryCountry:'NG',skills:['React'] }); expect(p.country).toBe('NG'); expect(p.skills).toEqual(['React']); expect(p.cv).toBe('unknown'); });
  it('prefers the saved earning profile over legacy values',() => expect(earningProfileFromLegacy({ primaryCountry:'GB',earningProfile:profile() }).country).toBe('NG'));
  it.each([['hoursPerWeek',169],['hoursPerWeek',-1],['minimumReward',NaN],['deadlineDays',366],['targetMonthlyIncome',Infinity],['shortTermTarget',-1],['cv','verified'],['country','Nigeria'],['timezone','wrong/time'],['github','javascript:alert(1)'],['portfolioUrl','https://secret:password@example.com'],['currencies',['usd']],['skills',Array(41).fill('x')],['remoteOnly','true']])('rejects invalid %s: %s',(key,value) => expect(validateEarningProfile({ [key]:value }).ok).toBe(false));
  it('selects only allowed profile fields',() => expect(validateEarningProfile({ token:'no',verified:true }).value).not.toHaveProperty('token'));
  it('normalizes case and distinct skills',() => expect(validateEarningProfile({ country:'ng',skills:['React','react',' React '] }).value.skills).toEqual(['React']));
});
describe('no-document entry path truthfulness',() => {
  it('keeps not mentioned requirements unknown',() => { expect(entryPath(opportunity()).cv).toBe('unknown'); expect(entryPath(opportunity()).portfolio).toBe('unknown'); });
  it('recognizes an explicit no-document statement',() => { const path = entryPath(opportunity({ description:'No CV required. No portfolio required.' })); expect(path.cv).toBe('confirmed-not-required'); expect(path.portfolio).toBe('confirmed-not-required'); });
  it('resolves contradictory evidence conservatively',() => expect(entryPath(opportunity({ description:'No portfolio required. You must submit a portfolio.' })).portfolio).toBe('required'));
  it('recognizes actual requirements',() => expect(entryPath(opportunity({ requirements:['Portfolio required','Upload your resume'] })).portfolio).toBe('required'));
  it('does not call a senior posting beginner-friendly',() => expect(entryPath(opportunity({ description:'Entry level support for senior engineers, 5 years experience' })).beginner).toBe('unknown'));
  it('requires evidence before claiming a quick application',() => expect(entryPath(opportunity()).quickApplication).toBe('unknown'));
  it('requires paid evidence before labelling research as paid',() => expect(entryPath(opportunity({ category:'Research',directPay:'unknown' })).researchTesting).toBe('unknown'));
});
describe('proof provenance',() => {
  const declared = () => ({ title:proof.title,kind:proof.kind,description:proof.description,skills:proof.skills,url:proof.url,provenance:proof.provenance,status:'user-declared' });
  it('saves a declaration and retains its exact provenance',() => { const r = validateDeclaredProof(declared(),now); expect(r.ok).toBe(true); expect(r.value.provenance).toBe(proof.provenance); expect(r.value.status).toBe('user-declared'); });
  it.each(['verified','imported','generated-from-existing-evidence'])('rejects a forged %s status',status => expect(validateDeclaredProof({ ...declared(),status },now).ok).toBe(false));
  it('requires provenance',() => expect(validateDeclaredProof({ ...declared(),provenance:'' },now).ok).toBe(false));
  it('marks missing work detail incomplete',() => expect(validateDeclaredProof({ ...declared(),description:'' },now).value.status).toBe('incomplete'));
  it('does not turn a link into verification',() => expect(validateDeclaredProof(declared(),now).value.status).not.toBe('verified'));
  it('generates a capability statement without extending the claimed work',() => { const card = proofCard(proof); expect(card.statement).toBe(proof.description); expect(card.sourceIds).toEqual([proof.id]); });
  it('rejects malformed private proof before it reaches rendering or ranking',() => { expect(readProofRecord({ ...proof,skills:[true] },'one')).toBeNull(); expect(readProofRecord({ ...proof,url:'javascript:alert(1)' },'two')).toBeNull(); expect(readProofRecord(proof,'safe')?.id).toBe('safe'); });
});
describe('personal fit boundaries',() => {
  it('is deterministic and does not mutate global rank',() => { const o = opportunity(); expect(fit(o)).toEqual(fit(o)); expect(o.rankScore).toBe(80); });
  it('ranks according to actual profile skills',() => expect(fit().score).toBeGreaterThan(fit(opportunity(),profile({ skills:[] })).score));
  it('never promotes unknown eligibility or cost to confirmed',() => { const f = fit(opportunity({ countries:[] })); expect(f.eligible).toBe('unknown'); expect(f.unknowns.join(' ')).toContain('zero cost is unconfirmed'); });
  it('hard-blocks an incompatible listed country regardless of learned preference',() => { const f = personalFit(opportunity({ countries:['US'] }),profile(),[proof],[],{ enabled:true,resetAt:null },now); expect(f.score).toBe(0); expect(f.eligible).toBe('blocked'); });
  it.each([{ capitalStatus:'capital_required' },{ deadline:'2026-10-15' },{ remote:false }])('blocks actual policy/eligibility conflicts %j',o => expect(fit(opportunity(o as Partial<FitOpportunity>),profile({ remoteOnly:true })).eligible).toBe('blocked'));
  it('explains matching and missing skills separately',() => { const f = fit(opportunity({ skills:['React','Go'] })); expect(f.matchedSkills).toEqual(['React']); expect(f.missingSkills).toEqual(['Go']); });
  it('uses existing proof without claiming its work is externally verified',() => { expect(fit(opportunity(),profile(),[proof]).proofIds).toEqual(['proof1']); expect(fit(opportunity(),profile(),[{ ...proof,status:'incomplete' }]).proofIds).toEqual([]); });
  it('does not compare salaries with hourly minimums or different currencies',() => { const f = fit(opportunity({ rewardMin:100000,currency:'USD',rewardBasis:'year' }),profile({ currencies:['USD'],minimumReward:10,rewardBasis:'hour' })); expect(f.components.find(c => c.key === 'reward')?.points).toBe(0); });
  it('explains missing documents and high experience requirements',() => { const f = fit(opportunity({ title:'Senior developer',requirements:['Portfolio required'] }),profile({ experience:'none',portfolio:'none' })); expect(f.requiredProof.length).toBe(1); expect(f.risks.join(' ')).toContain('exceeds'); });
  it('does not claim no-CV and no-portfolio for unknown listings',() => { const o = opportunity(); expect(selectRecommendations([o],new Map([[o.id,fit(o)]]),'No CV / portfolio path',[],now)).toEqual([]); });
  it('sorts by personal fit without changing source rank',() => { const a = opportunity({ id:'a',skills:['Go'],rankScore:99 }),b = opportunity({ id:'b',skills:['React'],rankScore:40 }); expect(selectRecommendations([a,b],new Map([[a.id,fit(a)],[b.id,fit(b)]]),'Highest fit',[],now)[0]?.id).toBe('b'); });
});
describe('grounded application assistance and fallback',() => {
  it('keeps actual facts classified and missing qualifications absent',async () => { const d = await assistApplication('cover-note',opportunity(),profile(),[proof]); expect(d.mode).toBe('deterministic'); expect(d.facts.some(f => f.text.includes('certified'))).toBe(false); expect(d.facts.map(f => f.kind)).toContain('user fact'); });
  it('offers a usable suggested cover note without inventing qualifications',async () => { const d = await assistApplication('cover-note',opportunity(),profile({ skills:[] }),[]); expect(d.opening).toContain('Hello, I am interested'); expect(d.opening).toContain('Developer'); expect(d.opening).not.toMatch(/certified|years of experience|guaranteed|eligible/); });
  it('rejects arbitrary AI qualifications before display',() => expect(validateGroundedSelection({ factIds:['invented:phd'],suggestions:['I am certified'] },applicationFacts(opportunity(),profile(),[])).ok).toBe(false));
  it('rejects extra free-form AI text even with valid citations',() => expect(validateGroundedSelection({ factIds:['source:title'],suggestions:[],text:'I have ten years experience' },applicationFacts(opportunity(),profile(),[])).ok).toBe(false));
  it('falls back after a provider error',async () => expect((await assistApplication('proposal',opportunity(),profile(),[],{ service:'FlagshipRouter',complete:async () => { throw Error('offline'); } })).mode).toBe('deterministic'));
  it('permits a bounded grounded model selection and always disables paid AI',async () => { const d = await assistApplication('short-pitch',opportunity(),profile(),[],{ service:'FlagshipRouter',complete:async input => { expect(input.paidAllowed).toBe(false); expect(input.maxCostUsd).toBe(0); return { factIds:['source:title'],suggestions:[] }; } }); expect(d.mode).toBe('ai-assisted'); expect(d.facts[0]?.text).toBe('Opportunity: Developer'); });
  it('includes unknowns and official submission as checklist actions',() => { const c = applicationChecklist(opportunity(),fit()); expect(c.some(x => x.label.includes('Clarify:'))).toBe(true); expect(c.at(-1)?.label).toContain('only after submitting'); });
});
describe('outcomes and reversible learning',() => {
  it('adds Preparing and Withdrawn without opening a direct Paid transition',() => { expect(applyTransition(application(),{ to:'preparing',now }).ok).toBe(true); expect(applyTransition(application(),{ to:'withdrawn',now }).ok).toBe(true); expect(applyTransition(application(),{ to:'paid',now }).ok).toBe(false); });
  it('bounds learning from real recorded outcomes',() => { const rows = Array.from({ length:20 },(_,i) => ({ ...application(),id:String(i),state:'paid' as const,appliedAt:now.toISOString() })); expect(outcomeLearning('Development',rows,{ enabled:true,resetAt:null }).points).toBe(6); });
  it('resets history without deleting actual applications or earnings',() => { const a = application(); const result = outcomeLearning('Development',[a],{ enabled:true,resetAt:'2026-10-17T00:00:00Z' }); expect(result.points).toBe(0); expect(a.state).toBe('saved'); });
  it('does not resurrect historical outcomes merely because notes were edited after reset',() => { const a = { ...application(),state:'paid' as const,updatedAt:'2026-11-01T00:00:00Z' }; expect(outcomeLearning('Development',[a],{ enabled:true,resetAt:'2026-10-20T00:00:00Z' }).points).toBe(0); });
  it('isolates input histories between users',() => { const alice = { ...application(),state:'accepted' as const,appliedAt:now.toISOString() }; expect(outcomeLearning('Development',[alice],{ enabled:true,resetAt:null }).points).toBeGreaterThan(0); expect(outcomeLearning('Development',[],{ enabled:true,resetAt:null }).points).toBe(0); });
  it('suggests a next action without inventing a payment',() => { const a = earningActions([opportunity()],new Map([['real:1',fit()]]),[],now); expect(a.join(' ')).toContain('Highest-fit'); expect(application().payment.paidUsd).toBeNull(); });
});
describe('personalized notification policy',() => {
  const p = { ...DEFAULT_PERSONAL_NOTIFICATION_POLICY,enabled:true,rules:['confirmed-zero'],quietStart:21,quietEnd:8 };
  it('defaults to no automatic messages',() => expect(DEFAULT_PERSONAL_NOTIFICATION_POLICY.enabled).toBe(false));
  it('honors timezone quiet hours',() => expect(inQuietHours(p,new Date('2026-10-16T22:00:00Z'))).toBe(true));
  it('fails closed with an invalid timezone',() => expect(inQuietHours({ ...p,timezone:'bad' },now)).toBe(true));
  it('requires confirmed zero-cost evidence',() => expect(personalizedNotices([opportunity()],new Map([['real:1',fit()]]),[],p,now)).toEqual([]));
  it('deduplicates matching notification keys',() => { const o = opportunity({ capitalStatus:'confirmed_free' }); expect(personalizedNotices([o,o],new Map([[o.id,fit(o)]]),[],p,now)).toHaveLength(1); });
  it.each([{ existingKeys:['same'],lastSentAt:null,sentToday:0 },{ existingKeys:[],lastSentAt:now.toISOString(),sentToday:0 },{ existingKeys:[],lastSentAt:null,sentToday:3 }])('blocks duplicates, cooldowns and daily caps %j',constraints => expect(noticeAllowed({ key:'same',policy:p,now,...constraints })).toBe(false));
});
