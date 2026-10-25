# Mycelium Phase 0.2 — Chris's Stage B go-ahead

> **Recorded follow-up, 25 October 2026, 09:14 GMT:** Chris replied **“approved”** to the reviewed v4 installation request ([decision/evidence](../../../team/DECISIONS.md#myc-stage-b-host-install-2026-10-25--v4-installation-go-ahead-chris)). **The host-install go-ahead is now given** for runtime`cfa2280a` / `stageb-0.5.tgz` under the reviewed commands; do not ask again. Execution is pending home-LAN access/evidence, not another approval. Task creation/model execution and every other gate retain their original limits. The original authorization below is preserved.

Date: 2026-10-25
To: Claude and Codex
Status: **STAGE B APPROVED WITH LIMITS**. Not approval for autonomous execution, emails, or production changes.

## Decision
Chris accepts the jointly reviewed five-field GitHub task contract (Codex consolidated review, Claude 25 Oct acknowledgement) as the basis for a small manual test. For **this bounded read-only proof only**, policy-level human approval is acceptable; strong human approval authentication and separated automated credentials remain required before any consequential or unattended action.

## Your instructions
1. Claude and Codex jointly implement/review the **smallest manual task runner and isolated result spool** on `fpd-prod` (J3455), including strict descriptor/event validation, one Git writer, committed claims/fencing, no accidental replay, safe crash handling, and fail-closed checks. Prefer minimal reversible changes. Do not compromise the working five-minute HubSync service. Keep CLI processes separate from its systemd polling oneshot and keep their credentials isolated.
2. Run **one manually initiated, read-only Codex review task**, followed by **one manually initiated, read-only Claude review of that result**, using real GitHub task/result files and no human copy/paste of results. One hand-off, **maximum two model calls overall**, maximum 180 seconds per call, maximum 30 minutes for the entire test. No automatic retries or additional reconciliation model calls.
3. Use existing ChatGPT Plus and Claude Pro **subscription sessions** and the existing billing guard; verify paid API keys/fallback and extra-usage credits are disabled. **£0 incremental spending.** If authentication, allowance, terms, billing or permitted unattended usage is uncertain, fail closed and ask Chris. This manual test does not authorise unattended use. Capture sanitised call/usage and timing evidence; do not confuse API-equivalent estimates with charges.
4. Publish a concise evidence report and proposed next step in GitHub. Confirm both outcomes and their corresponding task/event/result hashes, zero production mutations, duplicate prevention, no extra invocations, and any limitations.

## Boundaries
- **No** automatic CLI trigger from HubSync, no continuing loop, no new scheduled AI service, no new hosted infrastructure or database.
- **No** live SMTP2GO email or API-key provisioning in this stage. Notifications remain the separately approved **Stage C**. Sender and infrastructure must be FindPitches-owned only; **absolutely no Managed Technology involvement**.
- No changes to Pi discovery/delivery, Cloudflare production, J1900, or other work systems.
- No agent-created cascading tasks. Chris creates the two test tasks or explicitly reviews and authorises their creation; neither agent may self-approve consequential work.
- Respect existing security/operational gates. Never force push. On a failure or uncertain model-call outcome, stop and report; do not consume another model call.
- **Before running commands on the host**, present the exact implementation/deployment commands and reversibility plan to Chris for explicit go-ahead. This note authorises preparation, review, and the bounded test in principle, not unreviewed privileged host changes.

## Acceptance
One GitHub-mediated Codex → Claude result exchange with two calls or fewer, manually initiated, no manual relay, safe state tracking, and no unapproved expense or system modification. If it cannot be delivered inside these gates, explain the blocker rather than widening the scope.

Claude: acknowledge the revised joint contract and provide implementation/host plan. Codex: review runner/parser/claim/restart safety and agree or note blockers. Keep one shared implementation, not parallel competing frameworks.
