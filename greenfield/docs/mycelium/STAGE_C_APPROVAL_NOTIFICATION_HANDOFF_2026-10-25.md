# Mycelium Stage C — approval notification handoff (25 October 2026)

**Owner instruction conveyed by Quinn. Current priority: Mycelium agent synchronisation. PLAN ONLY.**

## Confirmed starting point
- Stage B bounded manual Codex→GitHub→Claude exchange completed; do not replay or issue more model calls.
- HubSync revision 3 was independently reviewed and, per Claude's recorded host evidence in commit `0a598421`, installed on `fpd-prod` with expected hash, successful poll, backlog 0 and timer active. No further HubSync installation is requested.
- Previous Codex session's GitHub permission issue resolved for connector *reads* in a fresh Codex task. Prefer connected GitHub tools. Do not infer untested write permissions.
- This handoff supersedes stale ACTIVE HubSync review entries in the execution register.

## Single next deliverable
**Claude: produce one concise, executable Stage C design/implementation plan** for a *minimal, isolated, FindPitches-only approval notification* when a durable GitHub task transitions to `awaiting_approval`. **Codex: conduct one bounded safety/feasibility review** and give PASS/FAIL with specific corrections. No recursive reviews or architecture expansion.

Plan should specify:
1. Exact task/event source, transition trigger, and idempotent durable send ledger. No repeated sends on polls, restarts, replay or partial failures; define retry and failure visibility.
2. Small separate `mycnotify` service/account on `fpd-prod`, with least-privilege access and no change to the working HubSync timer/writer or Stage B CLI allowlist.
3. SMTP2GO HTTPS API, using **separate FindPitches-only credentials and a verified FindPitches sender/domain**. Keep the recipient, API key and all secrets out of GitHub and task JSON. Never use any Managed Technology account, domain, device or infrastructure.
4. Notification contents: task ID, safe non-secret summary, exact review location, clear statement that **replying to the email is NOT approval**. Approval must be separately recorded via a later deliberately authorised mechanism.
5. One non-networked dry-run demonstrating correct selection, deduplication, bounded retry and no notification for unrelated task states. Define a later single dummy live-send check, contingent on **Chris's explicit approval** and preflight credential/sender validation.
6. Precise rollback/disable procedure, rate limit, logs (no secrets), and small acceptance checklist. £0 incremental cost: no new paid service or billable API usage.

## Boundaries
**Not authorised**: installing/running a new host service; provisioning secrets; sending email; changing production, Pi or J1900; any automatic AI/CLI dispatch (Stage D stays CLOSED); new model calls; changes to HubSync runtime; broad refactors or unrelated FindPitches discovery tasks.

## Handoff format
Each agent leaves **one short result**: latest relevant commit, pass/fail or blocker, next actor/action and whether Chris approval is required. Once reviewed, STOP and present Chris the specific proposed implementation/commands and the exact separate live-send approval gate.

**First actor: Claude. Second actor: Codex. Owner approval: required before host changes or live send; not required for planning and offline review.**
