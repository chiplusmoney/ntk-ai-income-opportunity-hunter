# M8 Engine discovery — PARTIAL

Inspection date: 16 October 2026 (UTC). Accepted runtime remains M7, version **0.6.0**, commit `4c94a5212195e9f170f3787c185227ad75da2ce3`.

## Decision

**No authoritative NTK AI Engine / FlagshipRouter deployment was established in the inspected accessible state. No integration target was selected.** This is a bounded discovery result, not a claim that the owner's Engine does not exist elsewhere.

Do not point Hunter at FreeLLMAPI directly. Do not treat a public upstream repository, a planned client, a healthy provider pool, or an old deployment report as an owner-authorized Engine endpoint. Do not create another Engine or copy either system into Hunter.

## Evidence inspected

| Surface | Observed result | Meaning and limitation |
|---|---|---|
| Canonical Hunter source and production readiness | Existing optional AI contracts; no bootstrap transport. Live `/ready` at 08:48:44 UTC returned 200, Firestore reachable, `aiRouting: not-configured`, `paidAiAuthorized: false`. | Deterministic Hunter is available; real AI is not connected. |
| Local project inventory | Searched project/document/download locations, named Engine/FlagshipRouter files, application scratch locations, and relevant safe configuration references. No Engine checkout/deployment contract found. | Files outside accessible locations are not ruled out. A different Windows user's directory was access denied; no bypass was attempted. |
| `C:/freellmapi` | Separate FreeLLMAPI source checkout. | Provider pool source, not a FlagshipRouter deployment. No source changed/copied. |
| Existing OpenCode configuration | References `https://freellmapi.alwaysdata.net/v1`. Only non-secret endpoint identity inspected for reporting. | Does not supply an Engine capability contract. No API key copied or used. |
| Neo public FreeLLMAPI site | `/api/ping` returned 200 at 08:47:05 UTC; protected `/api/health` returned 401; dashboard requires sign-in. | Pool liveness only. Free model availability, routing policy, paid-route exclusion and credentials are NOT VERIFIED. No inference request. |
| Neo AlwaysData administration | Signed in as chiplusmoney; accessible account contains one site for an unrelated application, visually identified as Ancient FTP. | No Engine site in this account. No configuration saved, billing changed, or new resource created. |
| Canonical isolated GitHub CLI identity | Verified chiplusmoney; accessible repository inventory returned only Hunter matching NTK/Engine/LLM/router names. | No accessible Engine repository established. Global GitHub identity was not switched. |
| Public FlagshipRouter repository discovery | Public upstream projects exist, including `theRizwan/FlagshipRouter`. | Upstream project identity is not the owner's deployment or authorization. No upstream source downloaded into Hunter. |
| TSL Business local docs/client | Optional `NtkAiClient` proposes `/v1/route`; its configuration uses unset environment references and no local `.env` was present. | Planned client, not evidence that a compatible Engine is deployed. Its request/response schema cannot safely be adopted as a verified contract. |
| Oracle NTKLLMAPI report | A dated 31 August report describes a separate FreeLLMAPI installation with loopback-only service and no public TLS application proxy at that time. | Historical pool infrastructure, not current Engine identity. No Oracle account/host was switched, probed or changed. |

Browser work used BrowserOS Neo only. Google sign-in to the existing AlwaysData administration completed as chiplusmoney without a human challenge. No alternate account was selected.

## Integration contract status

The following authoritative inputs remain **MISSING / NOT VERIFIED**:

- Engine origin and exact health/capability/execution URLs;
- deployment owner, current revision and intended Hunter tenant/application;
- authentication issuance, scope and server-side secret installation;
- supported capability names and exact request/response schemas;
- enforceable free-only admission before dispatch, provider pool health and eligible free models;
- response provenance, paid-use/cost semantics, usage accounting and error/rate-limit contracts.

There is deliberately no guessed HTTP transport, invented successful response, new Engine secret, or configured endpoint. Existing Hunter capability/safety modules are baseline code, not M8 production integration. The future client must adapt to the real API after these inputs are verified.

## Resumption boundary

The existing Engine's authoritative deployment/contract and authorized credential path must become accessible to chiplusmoney. This is an external discovery/access dependency, not a request for the owner to perform CLI, deployment or configuration work. Once accessible, the agent can inspect it and implement the integration autonomously, stopping only at an unavoidable human authentication/security gate.

Do not substitute the independent FreeLLMAPI pool or the unrelated AlwaysData site for this missing target. No resources should be recreated. M7 source cadence and deterministic behavior remain binding.
