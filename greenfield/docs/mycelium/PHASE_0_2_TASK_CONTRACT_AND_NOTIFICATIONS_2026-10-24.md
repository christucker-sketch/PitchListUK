# Mycelium Phase 0.2 — Agent Task Contract and Approval Notifications
**Date:** 2026-10-24
**Status:** PROPOSAL — Claude and Codex review required; no deployment authorised
**From:** Chris / Quinn
**Audience:** Claude, Codex, Mycelium contributors
**Repository/branch:** PitchListUK / `findpitches-v3/greenfield`

## Context and decision
Phase 0.1 has demonstrated unattended GitHub polling and read/write on the J3455 (`fpd-prod`) via `hubsync`, including reboot recovery. The watcher uses an isolated, restricted service account. It **does not launch AI CLIs**. Retain the working 5-minute watcher and existing safety controls; do not disturb FindPitches production, the Pi, or the J1900.

**Next priority:** Claude and Codex agree a *minimal, machine-readable task exchange contract* before implementing agent dispatch. Keep GitHub as the authoritative task/result/approval record. Separately design a lightweight email notification layer for human decisions.

## Request to Claude and Codex — agree contract first
Please both review the current HubSync implementation and existing hub conventions; propose a joint contract with **only** these required logical fields initially:
- `task_id` — unique immutable identifier;
- `assigned_agent` — explicit `claude` or `codex`;
- `instructions` — bounded task and relevant references;
- `status` — explicit lifecycle state;
- `result_location` — GitHub path/URL for output.

Agree precise paths, JSON/YAML shape, status vocabulary, allowed transitions, validation, and ownership rules before writing integration code. The status set must accommodate at least `pending`, `in_progress`, `awaiting_approval`, `completed`, `failed`, plus a way to represent `rejected` or `cancelled` decisions. Define atomic claiming, idempotency, duplicate suppression, conflict-safe updates, stale lease/restart recovery, and maximum handoffs to prevent agent loops. No agent may silently approve its own gate.

**Review deliverable:** one jointly agreed minimal schema, an illustrative task, state-transition rules, and an explicit list of unresolved points. Record both agents' agreement or dissent in the hub. No sprawling orchestration framework.

## Approval notification design (separate from core HubSync)
Chris has **verified FindPitches sending with SMTP2GO** and can provision a **dedicated Mycelium SMTP2GO HTTP API key**. Use **FindPitches-owned identity only** (e.g. `mycelium@findpitches.com` *only if sender authorised*). **Absolutely no Managed Technology domains, accounts, credentials, equipment, or infrastructure.**

Proposed flow:
1. Agent records an `awaiting_approval` state plus decision summary and GitHub reference in the agreed task format.
2. HubSync or a separate small notification worker detects the state transition; preferably keep notification delivery isolated from core polling.
3. Worker sends an email via SMTP2GO HTTP API to an explicitly configured, allowlisted recipient, containing task ID, concise decision request and direct GitHub link.
4. Persist durable notification identity (task ID + decision revision/event ID) and status so retries or 5-minute polls **cannot send duplicates**, including after a reboot. A genuinely new decision revision may notify once more.
5. Record send successes/failures, retry transient errors with bounded exponential backoff, cap sends/day, and alert/log permanent failure. Do not make a mail outage block GitHub polling.
6. Human approval/rejection must be **explicitly recorded and validated in GitHub**. Email replies or links alone are never approval. Until approved, relevant work is paused.

**Credentials:** never put API keys, email recipients, or sensitive decision payloads in commits, repository files, logs, or chat. Use an appropriate root-provisioned file/systemd credential accessible only to the notification process; validate permissions and credential scope. The hub is public: do not store secrets or private/customer data there. Define recipient configuration outside GitHub.

## Strict scope and phased test
**A. Contract review (NOW):** Claude/Codex review and agree format. No new always-on processes, AI dispatch or live emails.

**B. Manual CLI proof (approval required):** one explicitly invoked, narrowly scoped **read-only** task handed from one CLI agent to the other using GitHub; capture outcome, accounting/usage, termination and errors. Do not enable automatic CLI triggers.

**C. Notification proof (separate approval required):** after Chris provisions the SMTP2GO key locally, create one dummy `awaiting_approval` request and verify exactly one real email plus correct reboot/retry and duplicate behaviour.

**D. Watcher-to-CLI integration (later approval required):** only after contract and manual proof; add explicit authorization, budgets/usage limits, per-task maximum exchanges, safe allowlisted operations, and fail-closed behavior.

Always require Chris's approval before changing running services, enabling timers/agents, incurring charges, mutating production or sending live notifications. No unattended agent execution under Phase 0.2 design review.

## Requested immediate replies
- **Claude:** assess fit with existing `hubsync` implementation, propose minimal format/paths and safety implications; do not implement yet.
- **Codex:** independently review the same contract, identify parsing/CLI dispatch edge cases and confirm or suggest minimal amendments; do not implement yet.
- **Both:** converge on one contract and identify the smallest manually triggered demonstration. Surface disagreements for Chris's decision.

**Owner approval remains the gate.** Keep it simple: GitHub communicates, BRIX synchronises/notifies, AI agents reason only when explicitly authorised.
