# Mycelium P0 — GitHub cron synchronization (Chris decision, 23 October 2026)

## Decision
**Highest immediate engineering priority: reliable GitHub hub synchronization through the existing J3455 (`fpd-prod`).** This supersedes live subscription usage benchmarking, multi-agent free-form conversations, PostgreSQL provisioning and sophisticated cloud-coordinator implementation as the *next* task. Keep those as subsequent options, not cancelled projects.

Rationale: the hub already works as a shared record; manually asking Claude and Codex to check it and resolving stale pushes are the primary pain points. Automate transport and reliable task hand-off rather than paying AI tokens to poll.

## Phase 0.1 — GitHub-only cron watcher, no model executions
Claude and Codex: jointly review a minimal technical design, with Claude drafting implementation and Codex reviewing for race conditions/security. Prepare for Chris review; **no deployment or cron activation without approval**.

- Use `fpd-prod` only; `fpd-standby` unchanged. Run as least-privileged dedicated service identity; never place authentication secrets in Git, logs or agent prompts.
- Poll the relevant GitHub branch/hub every five minutes via GitHub API conditional requests or `git fetch` (no AI invocation for no changes). Prefer narrow scoped read/write GitHub credentials; do not reuse personal broad-scope tokens without review.
- Track last-seen commit, relevant changes, task ID, intended agent, task state and last-processed version in durable local state. Cold start, machine restart, network failure, rate limiting, task replays and simultaneous edits must be handled safely.
- Separate GitHub transport/writer from AI execution: agent generates structured results in an isolated workspace; one Git writer validates and commits. Fetch/rebase or use optimistic concurrency; **never force push**. If conflicts persist, stop and report. Ensure repeated polling doesn't cause duplicate processing or Claude↔Codex infinite loops.
- First demonstration: read relevant hub updates, detect a synthetic assignment, append/log a synthetic result in a dedicated **test-only path**, prove idempotence/concurrent-writer conflict handling, and stop. **Zero Claude/Codex model calls**; no production or discovery changes.
- Visible health/status, last successful poll, error alerts, manual pause/kill switch and log rotation. Keep resources low and prevent unnecessary electricity/processing. The BRIX runner is replaceable experimental compute, not the cloud-first system of record.

## Later, separately approved
- On an actual relevant task event, and only then, invoke existing subscription-authenticated Codex/Claude CLIs with bounded task context and explicit call/time caps. Check provider terms for unattended subscription use first.
- Compare real allowance impact and utility to manual hub work; benchmark is secondary to getting deterministic transport working.
- Keep £0 additional spend; never use paid API fallback; no recurring autonomous agent loops until approved.

## Requested deliverable
Compact implementation proposal, scripts/config in a reviewable branch or change request, exact permissions/auth requirements, simple end-to-end acceptance test plan and rollback. Report specifically how the design avoids stale Git pushes. Seek Chris's explicit approval before turning on a recurring cron timer or carrying out writes to the hub from the BRIX.

**Success criterion:** GitHub polling and safe test-message synchronization work unattended without launching an AI, and concurrent updates do not overwrite each other.
