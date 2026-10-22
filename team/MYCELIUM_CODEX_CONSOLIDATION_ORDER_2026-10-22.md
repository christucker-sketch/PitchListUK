# Mycelium Phase 0 — Codex consolidation order (22 October 2026)
**Authority: Chris. Design review ONLY. No implementation permission.**
**Existing authoritative commission:** [MYCELIUM_PHASE0_COMMISSION_2026-10-22.md](MYCELIUM_PHASE0_COMMISSION_2026-10-22.md). Preserve existing V3 incident/growth priorities.

Codex: Claude has now supplied [his discovery and worker design](../docs/mycelium/CLAUDE_DISCOVERY_DESIGN.md), including direct cross-review of your [Phase 0 draft](../docs/mycelium/PHASE_0_ARCHITECTURE_REVIEW.md). **Read his entire latest document, including sections 14–15; do not treat an older missing-file statement as current.**

**Your one deliverable:** revise the EXISTING `docs/mycelium/PHASE_0_ARCHITECTURE_REVIEW.md` into one consolidated joint architecture for Chris to review. No competing document, new tracker, implementation branch or side quests.

Required reconciliation:
1. Correct the Pi concurrency language: one task at a time, up to four different-host in-flight fetches within the actual reported 450MB cgroup, respecting per-host limits. Distinguish host-measured from repository defaults.
2. Make the **V3 verifier access gate mandatory**: a worker-accessible domain that V3 cannot legitimately verify must not receive further V3-directed acquisition budget; reopen only with verified changed capability or explicit policy approval. UKCraftFairs Option B stays OFF.
3. Keep **one bounded shadow experiment** with multiple separately attributable branches, not five standalone experiments. Exclude archive-index probing until its separate source-access/terms review is approved.
4. Preserve exact event/edition/standing-market attribution and original `fdx1` identity and source clocks. V3 alone decides customer READY.
5. Include producer **real-progress** telemetry (acquire timer enabled state, last successful cycle, last generated export, installed kit hash), distinguishing healthy heartbeat from stalled discovery. Report Claude's timer incident as resolved on host evidence; no Mycelium coding authorised.
6. Explicitly answer whether BRIX benchmark-only use is proposed as a later separate approval gate, or declined; do not silently infer Chris has granted host use.
7. Reconcile Claude's interface proposal with the schema/handoff, record any disagreements/unknowns and append a small decision matrix for Chris: suggested default, alternatives, operational/cost tradeoffs, and what approval is required. No fabricated runtime capabilities: unattended Claude runtime/Git write permissions remain unproven.
8. Have Claude cross-review the amended draft and record acknowledgement or remaining disagreement; only then label JOINT / AWAITING CHRIS APPROVAL.

**Stop conditions:** no cloud resources, database/provider provisioning, paid API/model calls, crawling, Pi/BRIX installation, production V3 changes, new kit, automation, runtime implementation or GitHub Actions. No Phase 1 until Chris explicitly authorises it. Keep LIVE producer freshness and CJS matters in their own existing queue.

**Completion:** link the revised SINGLE review; give Chris a short executive summary, unresolved decisions and recommended Phase 0A/0B sequence. Do not confuse written peer feedback with evidence that an unattended two-agent runtime is operating.
