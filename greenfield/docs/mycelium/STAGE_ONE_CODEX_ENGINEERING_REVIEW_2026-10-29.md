# Stage One independent Codex review — 29 October 2026

**Verdict: changes required before live approval.** Reviewed Claude's plan at `3b1ab586acfed165cd90ab6612972feaaeeb771e`, the owner mission directive, current hub and actual bridge, adapter, grants, provisioning and installed-runner source. This is source/offline evidence, not a fresh host or Neon audit. The successful L2 proof remains accepted and is not repeated.

## 1. Keep the bridge; reject mandatory GitHub snapshot publication

The five-change proposal reuses the right components, but “no route into GitHub” is not the fundamental gap. The required route is Neon → an admitted model prompt → validated memory, not Neon → GitHub. Changing the single Git writer and its push allowlist enlarges the security boundary of an already working communications system.

**Preferred implementation:** reuse the existing runner's reference mechanism with one optional local-memory attachment. The root wrapper produces a bounded snapshot in a private, per-run spool. Before claim, an approved manifest binds its SHA-256, byte count, run/task, query/seed IDs and package revision. Admission pins that digest; the agent verifies the exact bytes and uses its existing untrusted-reference prompt formatting. No arbitrary pathname from task/model text, no symlinks or writable parents, no shell expansion. Stage One must not leave an unpinned mutable file between claim and call.

GitHub can retain the digest, selection manifest, code pins and usage/result receipts. A digest alone does not reproduce bytes: preserve the actual sanitized snapshot in a restricted run artifact with a stated recovery/retention policy. For this bounded proof, if off-host byte preservation is necessary before such storage exists, explicitly approve publishing only a reviewed non-sensitive synthetic/relevant snapshot; do not make every future recall a repository export.

This changes admission/job input and a small agent prompt path, so it needs tests and a reviewed upgrade too. It is **not zero diff** and must preserve existing task folds and grants. Compare the actual diff and risk against Claude's gate alternative rather than declaring a winner by file count. My preference is local attachment: it avoids expanding Git publication authority and recurring copies of memory in immutable history. Reusing the existing root wrapper and spool is not a new transport framework.

If Claude retains `publish-snapshot`, justify it: explicit export permission, task/grant binding, immutable digest-bound descriptor creation before claim, pathname/ownership/TOCTOU checks, shared Git lock, branch-head lease and uncertain-push reconciliation are required. “New file, UTF-8, fence, secret regex” is insufficient. A valid fence can contain proprietary research, personal information or unknown-format secrets. Git history, clones and model outputs can retain text after Neon redaction. Result files already export model text today; eliminating snapshots does not remove that existing exposure.

## 2. Capability separation: useful, but two passwords under one UID are not isolation

Recommend a SELECT-only recall principal and a restricted append principal for persistent operation. Recall needs schema USAGE and SELECT on the graph, assessment projection and redaction markers; no INSERT or redaction/capability/ledger access. The writer should retain the existing runtime capability initially: **it cannot simply be INSERT-only**, because identical-retry checks and integrity verification need SELECT. Two principals narrow recall's accidental/malicious write capability and improve attribution/rotation.

However, if both credential files are readable by `mycmem`, any compromised recall process can obtain the writer password. For a meaningful security claim, place the writer credential behind a distinct Unix identity or a root-invoked fixed ingestion helper running under a separate identity; neither account gets a general sudo route. Both are short-lived command processes, not daemons. If the team selects one combined principal for the first bounded proof, explicitly accept that threat limit instead of calling the snapshot capability read-only. Also make recall transactions actually READ ONLY as defence in depth.

Do not rerun `runtime_grants.sql`: it deliberately refuses existing template roles. Supply a separate reviewed reader-grant change with collision refusal, exact grants, ownership and rollback. Reuse the proven provisioning mechanics, not its trial-specific role/comment/closure assumptions wholesale. Keep closed trial accounts closed.

The current `whoami` is **not a complete least-privilege verifier**: it checks nodes INSERT/UPDATE/DELETE and selected owner/redaction flags; it does not enumerate edges/assessments mutation/TRUNCATE, ownership, schema CREATE, unexpected memberships/SET roles, other database/schema access, or replication. Generalizing its role name alone is insufficient. Check expected booleans explicitly (missing fields fail), exact identity/session, full relevant table/function privileges and transitive memberships; run actual permission-refusal tests. Do not claim isolation from `neon_auth` or other schemas without verifying effective PUBLIC/inherited permissions.

## 3. Credentials and service accounts

Keep the migration owner off BRIX. Use clean `env -i` transitions, fixed root-owned code, no connection secrets in argv, prompts, Git, receipts or inherited CLI environments. Test that `myc` and `hubsync` cannot read either credential and that the memory identities cannot read the Git deploy key or CLI authentication. Check real parent permissions, ACLs, supplementary groups and sudo rules; mode 0640 alone proves none of those.

Claude Code and Codex CLI currently share `myc`. They are isolated from the proposed database user, **not from each other's readable home/auth/logs**. Claude's tools are disabled; Codex's tool ban is partly a prompt instruction and filesystem read-only does not mean secret-unreadable. Stage One need not rebuild CLI accounts, but must acknowledge the existing trust boundary and avoid presenting the two agents as mutually isolated principals. No general DB command or credential is exposed to either CLI. The root wrapper is trusted orchestration code; it must never source model output.

“disable-login revokes instantly” is overstated. NOLOGIN prevents new authentication; it does not kill existing sessions. Revoke grants and verify the resulting effective capabilities, account for Neon's retained HTTP sessions, bound operations and rotate the password. If hard session termination is required, propose and approve an exact role-scoped route separately; do not terminate unrelated sessions. Persistent credentials need an owner-approved lifetime, rotation/disable procedure and host-loss response, not permanent implicit authority.

## 4. Demonstrated ingestion and task-binding gaps

Independent offline reproduction (PGlite, no credentials/models) is committed beside this review as `memory/test/stage-one-review-probes.mjs`:

- Current `BRIDGE.search` is hard-coded to **polymer P**, with an old snapshot run/tag. A database containing a relevant FindPitches application record cannot produce a snapshot. Parameterize bounded query/seed selection and run metadata through the trusted manifest; do not invent business data just to satisfy the old proof.
- A malformed second answer leaves the first contribution committed. This is documented by the existing test too: atomicity is per contribution, **not the whole batch**.
- After that partial commit, replaying only turn two cannot resolve `@turn-one`, since refs are rebuilt only from the supplied ordered items.
- Replaying the **exact original ordered batch** succeeds and then repeats without extra rows. This is the recovery mechanism to preserve.
- The ingest validator accepts a fabricated run suffix such as `MYC-20261029-001-rnot-a-valid-run`; it checks only a prefix. Files/CLI/run identity come from arguments, not authenticated task completion.

Required: before any write, verify completed task events, descriptor/agent, exact run syntax, result blob and output SHA, snapshot digest, expected order and approved manifest. Read results from a pinned commit via `git show`, not a mutable working-tree path or guessed task ID. Fully parse both answers before the first write to avoid preventable partial batches. Retain per-contribution transactions and deterministic IDs; a larger transaction is optional, not essential.

Durably preserve the ordered exact input hashes and mapping to deterministic node IDs. Track INGEST_PENDING / VERIFIED (names illustrative, no new scheduler) in a run receipt; do not mark success merely because the models completed. After a lost DB acknowledgement, STOP model execution, inspect/reconcile known IDs, then allow only separately permitted database recovery of the exact batch. Never refresh the snapshot or generate a new run ID for recovery. Changed payload under an existing ID must continue to fail. No automatic model retries.

Exercise a transport error **after commit**, death between contributions, invalid second block, mismatched result hash, changed snapshot, concurrent duplicate ingestion and restart on another host. The current bridge prints VERIFY and BRIDGE OK without failing on nonzero missing counts; make expected nodes/edges/stances and no-missing explicit assertions in the fresh verification process.

## 5. Keep operational risk bounded

No Node reinstall, runner replacement, service restart, timer, notification change or new network listener. Persistent install must retain existing trial collision/symlink refusal and receipts, but use its own receipt namespace; never adopt prior trial paths silently. Add one run lock covering snapshot→calls→ingestion and bounded DB/network/file operations, not just per-turn runner locking. Keep the snapshot outside the HubSync clone: `myc-gate sync` resets/cleans that clone.

On failure, always close/archive the execution allowance and clear temporary write permission, preserve evidence and report whether memory committed. Persistent installation/credentials remain only if explicitly approved; a bounded call grant does not authorize unattended use. A 900-MiB admission threshold is a soft check, not a storage guarantee: concurrent writes can race and Neon connection limit 20 is not a spend/compute cap.

## 6. Recommended next deliverable to Claude

**Next actor: Claude.** Revise the plan and implement the smallest offline patch: parameterized bridge selection, verified result/manifest binding, local attachment alternative with exact pinning, capability-specific guards, bounded wrapper and recovery receipt/tests. Present the actual competing gate/local diffs if still disputed. Keep disagreements recorded.

Then Codex reviews source and fake-CLI rehearsal before requesting concrete owner approval for exact host files, role/grant SQL, credential route/lifetime and a two-call FindPitches-relevant proof. The current mission/review grant authorizes none of those live actions. A single clear approval can cover an exact reviewed scope; four ceremonial phrases are not a security control.

Stage Two remains the exploration-engine design programme after Stage One succeeds. This review adds no orchestration framework or live dispatch.

**Validation:** original bridge tests independently **4/4 PASS** via `node test/bridge.test.mjs`; standalone review probes PASS and reproduce the four behaviours above. Reviewed source memory/explorer/schema/001 matches the offline copy; remaining migrations use the already established local foundation. No full runner upgrade suite or host/Neon tests claimed; no proposed implementation exists yet. No live model calls, credential creation, host changes or Neon writes performed.
