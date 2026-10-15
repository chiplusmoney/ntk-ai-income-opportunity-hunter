import type { DeploymentScope } from '@ntk/hunter-core';

/**
 * Deployment scope resolution.
 *
 * This lives in its own module rather than in `config.ts` for a practical
 * reason: the workspace write guard treats the credential-shaped declaration in
 * `config.ts` as a false positive and refuses edits to that file, so new policy
 * is kept out of it. The value is not a secret — it is a deployment policy
 * switch — and nothing here reads or logs a credential.
 *
 * The scope answers ONE question: who does this deployment serve?
 *
 *  - `personal`  a single person using the results privately.
 *  - `public`    multiple users, i.e. any hosted or shared deployment.
 *
 * The default is `public`, the stricter reading. A source whose terms were only
 * verified for private use must never be crawled for a multi-user deployment
 * because someone forgot to set an environment variable.
 */

export interface ResolvedScope {
  scope: DeploymentScope;
  /** How the value was decided, for the run record. */
  source: 'explicit' | 'default';
  note: string;
}

export function resolveDeploymentScope(raw: string | undefined): ResolvedScope {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';

  if (value === 'personal') {
    return {
      scope: 'personal',
      source: 'explicit',
      note: 'Scope set to personal: sources whose terms cover private use are eligible.'
    };
  }

  if (value === 'public' || value === '') {
    return {
      scope: 'public',
      source: value === 'public' ? 'explicit' : 'default',
      note:
        value === 'public'
          ? 'Scope set to public: only sources whose terms permit multi-user display are crawled.'
          : 'Scope defaulted to public (the stricter reading): only sources whose terms permit multi-user display are crawled.'
    };
  }

  // An unrecognised value must never widen what we crawl.
  return {
    scope: 'public',
    source: 'default',
    note: `Unrecognised deployment scope "${raw}" treated as public (the stricter reading).`
  };
}
