# Mycelium — request to Claude: subscription usage and context overhead (23 October 2026)

## Background
The 13:04 London acceptance test on `fpd-prod` succeeded: Codex → Claude → Codex, three calls, 24 seconds, existing ChatGPT Plus and Claude Pro sign-ins, no relay. Codex reported 14,208 and 15,036 input tokens (12,288 cached each), with 89 and 128 output tokens. Claude reported 2 input and 233 output tokens, with an API-equivalent estimate of ~$0.012 **not a charge**. This proves handoff plumbing, not capacity, actual billing, or autonomous engineering quality.

Chris's concern: roughly 29k reported Codex input tokens for a tiny exchange could be a prohibitive subscription-usage overhead. £0 additional experimentation remains mandatory.

## Claude — deliver a reviewable plan and harness, NOT live executions
1. **Establish what these counters actually measure.** Inspect the exact CLI versions and JSON/telemetry semantics; distinguish total input, cached input, noncached input, output, tool/runtime context and any reasoning tokens. Avoid treating cached tokens as free or assuming their effect on ChatGPT Plus allowance. Explain why Codex reported ~12,288 cached input per call while Claude reports only 2 input tokens; do not compare unlike accounting formats.
2. **Determine observable subscription allowance.** Document the official usage pages and CLI-supported usage/status commands for *ChatGPT Plus Codex* and *Claude Pro Code*, including rolling windows, reporting delay, reset times and any inability to derive precise call quotas. Do not access private billing data; Chris will take baseline and post-run readings. Check extra-usage/paid-credit settings remain disabled. No API-key fallback.
3. **Identify leaner CLI orchestration.** Investigate instructions/context size, default tools/MCP configuration, model selection, session reuse versus fresh sessions, JSON modes and controllable cached-context overhead. Only supported flags and documented behaviour, no workaround that evades plan limits or provider terms. Keep isolation, read-only sandbox and no tools/side effects.
4. **Design a controlled benchmark** using existing `myc` on `fpd-prod`: baseline from BOTH dashboards, then up to five representative handoff cycles **only after Chris separately approves the live run**; observe after each cycle, handle dashboard lag. Compare a tiny fixed handoff with one realistic but safe engineering-review exchange, not five misleading identical prompts if caching skews results. Record per-agent model, version, prompt size, input/cached/output/reasoning fields where exposed, execution time, errors, percentage/remaining allowances and timestamps for both providers. Produce summaries and per-cycle estimates **with caveats**: avoid projecting 20/50/100 daily if dashboard resolution is too coarse, windows roll, or models/tokens differ.
5. **Strong bounds:** hard maximum five *cycles*, three model calls per cycle (15 total max), 180 seconds/call, 15 minutes maximum per cycle, abort on first error, near-quota warning, billing uncertainty, authentication expiry, unexpected key/environment or missing cap. Manual stop/kill. No background timer, schedule, cloud coordinator, new machine, subscription, hosting, spending or repository writes by the runtime. Store sanitized logs locally, not tokens/session secrets in GitHub.
6. **Safety and terms:** confirm whether the proposed frequency and unattended CLI subscription use is supported under current provider documentation; distinguish a manually triggered trial from sustained commercial/background use. If unclear, flag explicitly rather than declaring it allowed.
7. **Recommendation:** clear evidence-driven go/no-go for £0 subscription-based phase 0, first likely bottleneck, realistic workload budget and actionable overhead optimisations. Suggest the smallest next experiment needed. Distinguish measured results from hypotheses.

## Deliverables requested from Claude
- Written benchmark methodology and projected observability limitations on the Mycelium hub.
- A minimal auditable **non-scheduled** benchmark script/config committed for review, with safety guards, but **do not execute the live benchmark** without Chris approval.
- Specific instructions Chris can follow to record baseline/after-run usage from both accounts without exposing credentials or account information.
- Seek Codex technical cross-review of any recommended Codex CLI optimisations, without commissioning metered activity.

## Gates
**£0 new costs. Existing Plus/Pro sign-ins only.** No live model runs authorised by this document. No deploying services or changing BRIX roles. Keep `fpd-standby` untouched. Do not declare capacity from token count alone.
