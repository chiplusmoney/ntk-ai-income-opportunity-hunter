import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import {
  AiError,
  requestAnalysis,
  requestDraft,
  requestFit,
  requestProofSummary,
  type AiEnvelope,
  type AnalysisData,
  type DraftData,
  type FitData,
  type ProofSummaryData
} from './repositories/aiActions';

/**
 * AI assistance surfaces.
 *
 * Presentation rules (M8):
 *  - AI output is always labelled and always subordinate to verified facts and the deterministic score.
 *  - A Core outage shows a retryable "temporarily unavailable" state; the page keeps working.
 *  - Nothing here mutates the opportunity, its evidence or its score.
 */

type Phase = 'idle' | 'loading' | 'ready' | 'error';

interface PanelState<T> {
  phase: Phase;
  envelope: AiEnvelope<T> | null;
  error: AiError | null;
}

function idle<T>(): PanelState<T> {
  return { phase: 'idle', envelope: null, error: null };
}

function AiFooter({ envelope }: { envelope: AiEnvelope<unknown> }) {
  const { meta } = envelope;
  const when = new Date(meta.generatedAt);
  return (
    <p className="muted ai-provenance">
      AI assistance · generated {Number.isNaN(when.getTime()) ? meta.generatedAt : when.toLocaleString()}
      {meta.cached ? ' · cached result' : ''}
      {meta.model ? ` · served by ${meta.model}` : ''}
      {' · advisory only, verified facts above are authoritative'}
    </p>
  );
}

function AiErrorBox({ error, onRetry }: { error: AiError; onRetry: () => void }) {
  const unavailable = error.code === 'AI_SERVICE_TEMPORARILY_UNAVAILABLE' || error.code === 'AI_TIMEOUT' || error.status === 503;
  return (
    <div className="ai-error" role="status">
      <p>
        {unavailable
          ? 'AI assistance is temporarily unavailable. Your verified facts, evidence and score are unchanged.'
          : error.message}
      </p>
      {error.retryable && (
        <button className="secondary" type="button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ai-section">
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      {children}
    </div>
  );
}

export function AiOpportunityAssistance({ opportunityId }: { opportunityId: string }) {
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState<PanelState<AnalysisData>>(idle());
  const [fit, setFit] = useState<PanelState<FitData>>(idle());
  const [draft, setDraft] = useState<PanelState<DraftData>>(idle());
  const [purpose, setPurpose] = useState('short application message');

  if (!user) {
    return (
      <section className="profile-card ai-assistance">
        <h2>AI assistance</h2>
        <p>
          <Link to="/profile">Sign in</Link> to ask for an explanation, a personal-fit summary or a grounded draft. Everything on
          this page works without AI.
        </p>
      </section>
    );
  }

  async function run<T>(
    set: (value: PanelState<T>) => void,
    call: () => Promise<AiEnvelope<T>>,
    forceRefresh = false
  ) {
    set({ phase: 'loading', envelope: null, error: null });
    try {
      const envelope = await call();
      set({ phase: 'ready', envelope, error: null });
    } catch (error) {
      set({ phase: 'error', envelope: null, error: error instanceof AiError ? error : new AiError(String(error), 'AI_UNAVAILABLE', true, 0) });
    }
    void forceRefresh;
  }

  return (
    <section className="profile-card ai-assistance">
      <h2>AI assistance</h2>
      <p className="muted">
        Optional explanation and drafting. Verified source facts, eligibility, zero-capital checks, the reward and the
        deterministic fit score stay authoritative; AI never overrides them.
      </p>

      <Section title="AI Opportunity Analysis" description="What the work likely involves, preparation and practical considerations.">
        <button
          className="secondary"
          type="button"
          disabled={analysis.phase === 'loading'}
          onClick={() => void run(setAnalysis, () => requestAnalysis(opportunityId), Boolean(analysis.envelope))}
        >
          {analysis.phase === 'loading' ? 'Asking…' : analysis.envelope ? 'Refresh analysis' : 'Explain this opportunity'}
        </button>
        {analysis.phase === 'error' && analysis.error && (
          <AiErrorBox error={analysis.error} onRetry={() => void run(setAnalysis, () => requestAnalysis(opportunityId))} />
        )}
        {analysis.phase === 'ready' && analysis.envelope && (
          <div className="ai-result">
            <p>{analysis.envelope.data.summary}</p>
            {analysis.envelope.data.work_involved.length > 0 && (
              <>
                <h4>Likely work involved</h4>
                <ul>{analysis.envelope.data.work_involved.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            )}
            {analysis.envelope.data.preparation.length > 0 && (
              <>
                <h4>Useful preparation</h4>
                <ul>{analysis.envelope.data.preparation.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            )}
            {analysis.envelope.data.weaknesses.length > 0 && (
              <>
                <h4>Things to watch</h4>
                <ul>{analysis.envelope.data.weaknesses.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            )}
            {analysis.envelope.data.considerations.length > 0 && (
              <>
                <h4>Practical considerations</h4>
                <ul>{analysis.envelope.data.considerations.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            )}
            <AiFooter envelope={analysis.envelope} />
          </div>
        )}
      </Section>

      <Section title="Why This Fits You" description="Uses only the profile facts you already provided.">
        <button
          className="secondary"
          type="button"
          disabled={fit.phase === 'loading'}
          onClick={() => void run(setFit, () => requestFit(opportunityId), Boolean(fit.envelope))}
        >
          {fit.phase === 'loading' ? 'Asking…' : fit.envelope ? 'Refresh fit explanation' : 'Explain my fit'}
        </button>
        {fit.phase === 'error' && fit.error && (
          <AiErrorBox error={fit.error} onRetry={() => void run(setFit, () => requestFit(opportunityId))} />
        )}
        {fit.phase === 'ready' && fit.envelope && (
          <div className="ai-result">
            <p>{fit.envelope.data.fit_summary}</p>
            {fit.envelope.data.strengths.length > 0 && (
              <>
                <h4>Strengths</h4>
                <ul>{fit.envelope.data.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            )}
            {fit.envelope.data.gaps.length > 0 && (
              <>
                <h4>Gaps</h4>
                <ul>{fit.envelope.data.gaps.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            )}
            <p>
              <b>Suggested next step:</b> {fit.envelope.data.recommended_next_step}
            </p>
            <p className="muted">
              AI explanation confidence {fit.envelope.data.confidence}/100 · the deterministic fit score above is unchanged.
            </p>
            <AiFooter envelope={fit.envelope} />
          </div>
        )}
      </Section>

      <Section title="Application Draft" description="Draft text you can edit. It is never submitted automatically.">
        <label>
          Draft purpose
          <input value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={120} />
        </label>
        <button
          className="secondary"
          type="button"
          disabled={draft.phase === 'loading'}
          onClick={() => void run(setDraft, () => requestDraft(opportunityId, purpose), Boolean(draft.envelope))}
        >
          {draft.phase === 'loading' ? 'Drafting…' : draft.envelope ? 'Regenerate draft' : 'Draft with AI'}
        </button>
        {draft.phase === 'error' && draft.error && (
          <AiErrorBox error={draft.error} onRetry={() => void run(setDraft, () => requestDraft(opportunityId, purpose))} />
        )}
        {draft.phase === 'ready' && draft.envelope && (
          <div className="ai-result">
            <label>
              Editable draft (review before use)
              <textarea defaultValue={draft.envelope.data.draft_text} rows={8} />
            </label>
            {draft.envelope.data.missing_information.length > 0 && (
              <>
                <h4>Information the draft could not use</h4>
                <ul>{draft.envelope.data.missing_information.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            )}
            {draft.envelope.data.evidence_used.length > 0 && (
              <>
                <h4>Grounded in</h4>
                <ul>{draft.envelope.data.evidence_used.map((item) => <li key={item}>{item}</li>)}</ul>
              </>
            )}
            <AiFooter envelope={draft.envelope} />
          </div>
        )}
      </Section>
    </section>
  );
}

export function AiProofSummary() {
  const { user } = useAuth();
  const [state, setState] = useState<PanelState<ProofSummaryData>>(idle());

  if (!user) return null;

  async function run(forceRefresh = false) {
    setState({ phase: 'loading', envelope: null, error: null });
    try {
      const envelope = await requestProofSummary(forceRefresh);
      setState({ phase: 'ready', envelope, error: null });
    } catch (error) {
      setState({ phase: 'error', envelope: null, error: error instanceof AiError ? error : new AiError(String(error), 'AI_UNAVAILABLE', true, 0) });
    }
  }

  return (
    <div className="profile-card ai-assistance">
      <h2>Proof Builder — AI summary</h2>
      <p className="muted">
        A concise summary built only from the proof records you recorded. It never adds experience, results or
        qualifications that are not already in your library.
      </p>
      <button className="secondary" type="button" disabled={state.phase === 'loading'} onClick={() => void run(Boolean(state.envelope))}>
        {state.phase === 'loading' ? 'Summarising…' : state.envelope ? 'Refresh summary' : 'Summarise my proof'}
      </button>
      {state.phase === 'error' && state.error && <AiErrorBox error={state.error} onRetry={() => void run()} />}
      {state.phase === 'ready' && state.envelope && (
        <div className="ai-result">
          <p>{state.envelope.data.proof_summary}</p>
          {state.envelope.data.highlights.length > 0 && (
            <>
              <h4>Highlights</h4>
              <ul>{state.envelope.data.highlights.map((item) => <li key={item}>{item}</li>)}</ul>
            </>
          )}
          {state.envelope.data.evidence_refs.length > 0 && (
            <>
              <h4>Based on</h4>
              <ul>{state.envelope.data.evidence_refs.map((item) => <li key={item}>{item}</li>)}</ul>
            </>
          )}
          <AiFooter envelope={state.envelope} />
        </div>
      )}
    </div>
  );
}
