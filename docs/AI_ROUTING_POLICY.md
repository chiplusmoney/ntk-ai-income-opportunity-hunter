# AI Routing Policy — Free First, Capability Aware

The application does not choose model names directly. It requests a capability/task from FlagshipRouter.

## Decision order
1. Determine task type, complexity, context size, latency need and risk level.
2. Select the lowest-cost free model that meets the required capability/reliability threshold.
3. For high-risk claims, use deterministic evidence checks first and optionally cross-check with a second free model.
4. If no free model can meet the threshold and owner policy permits paid use, choose the least-cost paid model that does.
5. If paid use is unavailable/disabled, fall back to the best eligible free model and lower confidence explicitly.
6. Never let a weaker model manufacture facts missing from evidence.

## Example task classes
- Cheap/free small model: tagging, language detection, simple summarization, deduplication assistance.
- Stronger free model: requirement extraction, comparative analysis, suspicious-pattern review, application-tailoring suggestions.
- Paid later only when justified: difficult multi-document reasoning, ambiguous fraud/risk analysis, long-context synthesis where free models fail quality thresholds.

## Engine boundary
FlagshipRouter is the routing/control brain. FreeLLMAPI is an independent provider/model pool adapter. Do not source-merge them.
