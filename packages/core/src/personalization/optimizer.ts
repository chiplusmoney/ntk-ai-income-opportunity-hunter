import type { ApplicationRecord } from '../applications/lifecycle.js';
import type { FitOpportunity, PersonalFit } from './fit.js';
export function earningActions(rows: readonly FitOpportunity[], fits: ReadonlyMap<string, PersonalFit>, applications: readonly (ApplicationRecord & { followUpDate?: string | null; nextAction?: string })[], now: Date): string[] {
  const actions: string[] = [];
  for (const a of applications) if (a.followUpDate && a.followUpDate <= now.toISOString().slice(0,10) && !['paid','rejected','expired','withdrawn'].includes(a.state)) actions.push(`Follow up: ${a.title}${a.nextAction ? ` — ${a.nextAction}` : ''}`);
  const ranked = rows.filter(o => fits.get(o.id)?.eligible !== 'blocked').sort((a,b) => (fits.get(b.id)?.score ?? 0) - (fits.get(a.id)?.score ?? 0));
  const best = ranked[0]; if (best) actions.push(`Highest-fit next action: ${best.title} — ${fits.get(best.id)?.nextAction}`);
  const quick = ranked.find(o => fits.get(o.id)?.path.quickApplication === true); if (quick) actions.push(`Quick application stated: ${quick.title}`);
  const proof = ranked.find(o => fits.get(o.id)?.requiredProof.length); if (proof) actions.push(`Proof gap: ${proof.title} — ${fits.get(proof.id)?.requiredProof.join(', ')}`);
  const expiry = ranked.find(o => o.deadline && Date.parse(o.deadline) > now.getTime() && Date.parse(o.deadline) - now.getTime() < 3*86400000); if (expiry) actions.push(`Deadline approaching: ${expiry.title}`);
  const gaps = new Map<string,number>(); for (const o of ranked.slice(0,50)) for (const s of fits.get(o.id)?.missingSkills ?? []) gaps.set(s,(gaps.get(s) ?? 0)+1);
  const gap = [...gaps].sort((a,b) => b[1]-a[1])[0]; if (gap) actions.push(`Learning option: ${gap[0]} appears in ${gap[1]} current listings; other eligibility checks still apply`);
  return actions.slice(0,8);
}
