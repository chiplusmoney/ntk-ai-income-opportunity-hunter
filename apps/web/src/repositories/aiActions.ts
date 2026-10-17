import { auth } from '../lib/firebase';

/**
 * AI assistance client.
 *
 * The PWA never talks to the AlwaysData Core: every call goes to the Render Hunter API under /v1/ai,
 * which holds the Core credential server-side. A 503 here means "all free routes are cooling down";
 * the UI must degrade to deterministic content instead of failing the page.
 */

const API_BASE = 'https://ntk-hunter-api.onrender.com';

export type AiCapabilityName = 'analysis' | 'fit' | 'draft' | 'proof';

export interface AiMeta {
  capability: AiCapabilityName;
  opportunityId: string | null;
  cached: boolean;
  model: string | null;
  provider: string | null;
  promptVersion: string;
  latencyMs: number;
  generatedAt: string;
  attempts?: number;
}

export interface AnalysisData {
  summary: string;
  work_involved: string[];
  preparation: string[];
  strengths: string[];
  weaknesses: string[];
  considerations: string[];
}

export interface FitData {
  fit_summary: string;
  strengths: string[];
  gaps: string[];
  recommended_next_step: string;
  confidence: number;
}

export interface DraftData {
  draft_text: string;
  evidence_used: string[];
  missing_information: string[];
}

export interface ProofSummaryData {
  proof_summary: string;
  highlights: string[];
  evidence_refs: string[];
}

export interface AiEnvelope<T> {
  capability: AiCapabilityName;
  data: T;
  meta: AiMeta;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
    readonly status: number
  ) {
    super(message);
    this.name = 'AiError';
  }
}

function friendly(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new AiError('AI assistance timed out. Your verified data is unaffected.', 'AI_TIMEOUT', true, 0);
  }
  return new AiError(
    error instanceof Error ? error.message : 'AI assistance is unavailable right now.',
    'AI_UNAVAILABLE',
    true,
    0
  );
}

async function postAi<T>(path: string, body: Record<string, unknown> = {}): Promise<AiEnvelope<T>> {
  const user = auth?.currentUser;
  if (!user) throw new AiError('Sign in to use AI assistance.', 'SIGN_IN_REQUIRED', false, 401);
  const uid = user.uid;
  const token = await user.getIdToken();
  if (auth?.currentUser?.uid !== uid) throw new AiError('Your account changed. Retry in the current account.', 'ACCOUNT_CHANGED', false, 401);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000)
    });
  } catch (error) {
    throw friendly(error);
  }

  const payload = (await response.json().catch(() => ({}))) as {
    data?: T;
    meta?: AiMeta;
    error?: string;
    code?: string;
    retryable?: boolean;
  };

  if (!response.ok || !payload.data) {
    throw new AiError(
      typeof payload.error === 'string' ? payload.error : 'AI assistance is unavailable right now.',
      payload.code ?? 'AI_UNAVAILABLE',
      payload.retryable !== false,
      response.status
    );
  }
  return { capability: (payload.meta?.capability ?? 'analysis') as AiCapabilityName, data: payload.data, meta: payload.meta as AiMeta };
}

export interface AiStatus {
  state: 'available' | 'degraded' | 'temporarily-unavailable';
  configured: boolean;
  detail: string;
  checkedAt: string;
}

export async function readAiStatus(): Promise<AiStatus> {
  const user = auth?.currentUser;
  if (!user) return { state: 'temporarily-unavailable', configured: false, detail: 'not signed in', checkedAt: new Date().toISOString() };
  try {
    const token = await user.getIdToken();
    const response = await fetch(`${API_BASE}/v1/ai/status`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('status unavailable');
    return (await response.json()) as AiStatus;
  } catch {
    return { state: 'temporarily-unavailable', configured: false, detail: 'status check failed', checkedAt: new Date().toISOString() };
  }
}

export function requestAnalysis(opportunityId: string, forceRefresh = false) {
  return postAi<AnalysisData>(`/v1/ai/opportunities/${encodeURIComponent(opportunityId)}/analysis`, { forceRefresh });
}

export function requestFit(opportunityId: string, forceRefresh = false) {
  return postAi<FitData>(`/v1/ai/opportunities/${encodeURIComponent(opportunityId)}/fit`, { forceRefresh });
}

export function requestDraft(opportunityId: string, purpose: string, forceRefresh = false) {
  return postAi<DraftData>(`/v1/ai/opportunities/${encodeURIComponent(opportunityId)}/draft`, {
    purpose: purpose.slice(0, 400),
    forceRefresh
  });
}

export function requestProofSummary(forceRefresh = false) {
  return postAi<ProofSummaryData>('/v1/ai/proof-summary', { forceRefresh });
}
