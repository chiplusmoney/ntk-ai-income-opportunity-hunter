import { safeWebUrl } from './profile.js';

export type ProofStatus = 'user-declared' | 'incomplete' | 'imported' | 'verified' | 'generated-from-existing-evidence';
export const PROOF_KINDS = ['project', 'screenshot', 'completed-task', 'work-sample', 'certificate', 'course-project', 'code', 'design', 'writing', 'experience', 'hunter-outcome'] as const;
export interface ProofRecord {
  id: string; title: string; kind: typeof PROOF_KINDS[number]; description: string; skills: string[];
  url: string; provenance: string; status: ProofStatus; sourceIds: string[]; createdAt: string; updatedAt: string;
}

/** Imported/verified status is never accepted from a browser form. A link is a declaration, not verification. */
export function validateDeclaredProof(input: unknown, now: Date): { ok: boolean; value: Omit<ProofRecord, 'id'>; problems: string[] } {
  const s = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const problems: string[] = [];
  const str = (k: string, max: number) => { const v = s[k]; if (typeof v !== 'string' || v.length > max) { problems.push(`${k}: invalid text`); return ''; } return v.trim(); };
  const title = str('title', 160), description = str('description', 6000), url = str('url', 2000), provenance = str('provenance', 1000);
  if (!title) problems.push('Give this proof a title');
  if (!provenance) problems.push('Describe where this evidence came from and what you personally did');
  if (!safeWebUrl(url)) problems.push('Use an HTTPS evidence link without credentials');
  const skills = Array.isArray(s.skills) && s.skills.length <= 40 && s.skills.every(x => typeof x === 'string' && x.length <= 100) ? [...new Set((s.skills as string[]).map(x => x.trim()).filter(Boolean))] : [];
  if (!Array.isArray(s.skills) || skills.length !== (s.skills as unknown[]).filter(Boolean).length) problems.push('Use distinct short skill entries');
  if (!PROOF_KINDS.includes(s.kind as typeof PROOF_KINDS[number]) || s.kind === 'hunter-outcome') problems.push('Choose a manual proof type');
  if (s.status !== 'user-declared' && s.status !== 'incomplete' && s.status !== undefined) problems.push('Only the trusted server may import or verify evidence');
  const status = s.status === 'incomplete' || !description ? 'incomplete' : 'user-declared';
  return { ok: problems.length === 0, problems, value: { title, description, url, provenance, skills, kind: s.kind as ProofRecord['kind'], status, sourceIds: [], createdAt: now.toISOString(), updatedAt: now.toISOString() } };
}

/** A deterministic capability card copies genuine evidence and keeps its provenance visible. */
export function proofCard(p: ProofRecord): { title: string; statement: string; provenance: string; status: ProofStatus; sourceIds: string[] } {
  return { title: p.title, statement: p.description, provenance: `${p.status}: ${p.provenance}${p.url ? ` (${p.url})` : ''}`,
    status: 'generated-from-existing-evidence', sourceIds: [p.id] };
}

/** Firestore data is untrusted even inside an owner's namespace. Reject malformed rows before ranking/rendering. */
export function readProofRecord(raw: unknown,id: string): ProofRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string,unknown>;
  if (!PROOF_KINDS.includes(p.kind as ProofRecord['kind']) || !['user-declared','incomplete','imported','verified','generated-from-existing-evidence'].includes(String(p.status))) return null;
  for (const [key,max] of [['title',160],['description',6000],['url',2000],['provenance',1000],['createdAt',100],['updatedAt',100]] as const) if (typeof p[key] !== 'string' || (p[key] as string).length > max) return null;
  if (!safeWebUrl(p.url as string) || !(p.title as string).trim() || !(p.provenance as string).trim()) return null;
  for (const key of ['skills','sourceIds']) if (!Array.isArray(p[key]) || (p[key] as unknown[]).length > 40 || !(p[key] as unknown[]).every(s => typeof s === 'string' && s.length <= 220)) return null;
  return { id,title:p.title as string,kind:p.kind as ProofRecord['kind'],description:p.description as string,url:p.url as string,provenance:p.provenance as string,status:p.status as ProofStatus,skills:p.skills as string[],sourceIds:p.sourceIds as string[],createdAt:p.createdAt as string,updatedAt:p.updatedAt as string };
}
