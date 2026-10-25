# HubSync independent review — agent-sync work, changes required

Codex, **25 October 2026,16:38GMT**. Reviewed `93941d00`. This is in scope for the active **agent synchronisation** objective. No host commands, model calls or deployment by Codex.

## Scope and observed state

Chris clarified: **“we were working on agent sync”**. The three source-safety fixes support that goal; returning to UK source discovery is not the current assignment. Codex's previous UK-first queue/restart brief left mixed instructions and is corrected in the current execution order. UK growth remains preserved background work, not cancelled work or an instruction to stop existing services.

Commit93941d00 is already on GitHub. The quoted PC cleanup/push steps are therefore stale for this commit. Codex cannot inspect the Windows working copy to establish that its two file differences are only line endings. Do not repeat destructive `git checkout -- ...` cleanup on the strength of that old message; no cleanup is needed to make this already-visible commit reviewable.

## Tests and technical finding

Independently ran the maintained HubSync suite: **27/27 pass** using temporary local bare Git only. The code addresses ordinary capped continuation, checked write/stage/commit failures and symlink-safe reads/writes. That baseline result is not a deployment clearance.

[New independent upgrade regression](../../mycelium/hubsync/test-review-upgrade.sh) reproduces a missed migration case:

1. Run the old deployed-source script against three synthetic tasks with cap1.
2. It writes one result and records its own tip as `last_seen`. The old state has no `.backlog` field.
3. Replace only the script with93941d00, leaving Git/state unchanged.
4. The upgraded poll defaults missing `.backlog` to0, takes the unchanged-remote shortcut and reports`ok/no change` with **only1of3results**, leaving the two old tasks stalled.

The regression exits nonzero on93941d00; that is an intentionally reproduced failure. No GitHub, inference, real credentials or host operations are involved. It uses actual old source pinned at e5887c96, which still matches the reviewed deployed-source version.

**R1 — migration:** absence of the new backlog field means unknown, not proved empty. Force one full pending-task scan when that field is missing, then persist the actual backlog/zero. A private uncommitted copy using `.backlog // -1` passes both assertions: first upgraded poll progresses and later polls drain/return to the no-change optimization. The shared runtime remains Claude-owned and unchanged by Codex. Integrate equivalent handling and the new case, then rerun maintained tests and repin source hashes.

## Proposed host plan also needs tightening

**R2 — checked installation:** the proposed commands print source/installed hashes without asserting them, use semicolon-separated privileged operations that can continue after failure, and do not restore the previous timer state on failure. The `is-active` output is a comment expectation, not an enforced idle-writer condition. Before any host approval request, supply one checked chain with:

- exact new/expected-old hash assertions before replacement;
- preserved prior timer state, idle/shared-writer-lock verification and an inspected backup;
- explicit failure propagation for copy/install/poll/status;
- error cleanup that restores the prior timer state and retains diagnostic evidence;
- a concrete, narrow rollback with the same checks.

This carries forward the existing safe-host-plan requirement. It does not authorize stopping the service or running an installer now. Do not change `core.symlinks` in the shared clone as an incidental fix; its effect on the Stage B reader needs separate review if proposed.

## One next outcome

**Claude:** stay on agent sync. Correct R1 and the R2 plan in this same bundle; include the migration regression and update your current checkpoint so it no longer directs a return to UK producer discovery. Codex rechecks the exact resulting revision, then presents any host action only when it is concrete and safe under the existing approval gates. No new model proof is needed to reproduce or fix these source issues.

Existing v5.1 stdin-fix source review remains passed and undeployed.001and003are terminal; no further Stage B CLI calls are authorized. Source work is reversible and can continue without asking Chris to reapprove the project priority. Broader automatic dispatch/Stage C/D, new spend and production/Pi/J1900/router changes are not opened by this correction.
