# Stage One final implementation proposal: BRIX-native shared memory (29 Oct 2026)

**Status: for Chris's review. Nothing has been installed, created, written or called.**

This proposal is Claude's revision of [plan `3b1ab586`](STAGE_ONE_BRIX_NATIVE_MEMORY_PLAN_2026-10-29.md). It takes in Codex's [independent review `84069505`](STAGE_ONE_CODEX_ENGINEERING_REVIEW_2026-10-29.md), and its offline patch is committed alongside it.

Codex asked to review the source and the fake-CLI rehearsal before Chris approves anything live. **Codex's sign-off on this patch is therefore the one remaining review step** (§8). Every Codex finding is listed in §2, with what was done about it. Disagreements are recorded rather than smoothed over.

**Revision 2 (29 Oct, answers Codex's source review [`95a13b2b`](STAGE_ONE_REPLY_CODEX_REVIEW_2026-10-29.md) of `24d3a89e`).** All five defects are fixed, each with failure regressions (§2a):
- **R1:** the PC password copy is now fail-closed.
- **R2:** an interrupted `run` is reconciled database-only.
- **R3:** every contribution goes through the append API's own prepare before any write.
- **R4:** verification compares every persisted field.
- **R5:** the login's limit, expiry and membership options are enforced at every bridge process.

The architecture is unchanged.

**Revision 2b (29 Oct, a live finding during the approved setup at `d2d28c06`).**

The PC `create` step created the login, then **refused it and closed it**. Its own verification rejected one membership row: `mycelium_bridge_fpd → member neondb_owner (ADMIN, INHERIT false, SET false)`.

That row is standard PostgreSQL 16+ behaviour, not a privilege for the login. When a CREATEROLE non-superuser creates a role, the new role is granted back to its creator, ADMIN only. My offline tests created roles as a superuser, which gets no such grant, so they missed it.

What the fail-closed path did:
- the first login `mycelium_bridge_fpd` was closed and verified closed (NOLOGIN, expired 1970, no membership);
- the password copy was removed from the PC;
- grant receipt `d246ad79…` was retired.

**Fix:**
- The PC verification (`assertBridgeLogin`) and the runtime privilege check (`privileges.mjs`) now accept **exactly** the creator's ADMIN-only grant. Any other grant of the login, or that grant with INHERIT or SET, still fails.
- The offline world now creates the bridge **as a CREATEROLE `neondb_owner`**, as Neon does, so the tests reproduce the live row.
- A closed login is never reopened, so the new login is **`mycelium_bridge_fpd_r2`**. The closed one stays as an audit trail, as with the trial logins.
- `teardown` now removes the store when it holds no snapshot or batch, so the BRIX install can be closed and set up again at the new commit.

Tests: Stage One 10/10 (creator grant reproduced, with INHERIT, SET and foreign-grant drift detected); host rehearsal 44/44; owner 25/25.

**Revision 2a (answers Codex [`ae32a110`](STAGE_ONE_REV2_CODEX_REVIEW_2026-10-29.md), which found R2–R5 addressed and the architecture suitable).** It completes R1:
- A missing or malformed `-ValidUntil` is now checked **inside** the cleanup block, so it STOPs, sends nothing and removes the expected copy (regressions for create and rotate).
- A command line that PowerShell itself rejects (a mistyped `-Mode` or `-Commit`) never starts the script. That case is documented, and `BEFORE OK` tells you to delete the copy by hand if it happens.

## 1. The four questions, answered

### Q1. Should memory snapshots be published to GitHub?

**No. Snapshots stay local, sealed and pinned by digest.** Codex was right, and I withdraw `publish-snapshot`.

Why:
- **It would widen a security boundary.** It changes the single Git writer's push contract.
- **It conflicts with redaction.** Every recall would land in immutable history, which Neon redaction cannot reach.
- **A regex is not a sensitivity filter.** It cannot stop proprietary or personal text.

What replaces it:
- **A new reference form.** The existing runner gets one: a task line `memref: sha256:<digest>`.
- **The digest lives in the task descriptor.** That descriptor is on GitHub, and the allowlist pins its blob. So Chris approves the exact memory bytes the models will see.
- **The bytes live on fpd-prod only**, at `/var/lib/mycelium-memory/snapshots/<digest>.md` (root:hubsync 0440).
- **`myc-gate` checks the file twice, at claim and again at admit.** Each time it copies the file privately and requires:
  - root ownership, with nothing group- or other-writable, the folders included;
  - no symlink;
  - ≤ 32 KB of clean UTF-8;
  - exactly the pinned digest.
- **The rest of the runner is untouched.** The push contract, the shared fold block (mycnotify parity), `myc-agent` and `myc-stageb` do not change.

**Audit trail:**
- GitHub holds the descriptor's digest, the results and the gate's completion events, which pin each result's sha256.
- Every Neon contribution carries the batch, the snapshot digest, the result sha256, the result blob and the hub commit.

**Limit (accepted, see §6 D3):** the snapshot bytes exist only on fpd-prod.

### Q2. Should recall and ingestion use separate database identities?

**Not for Stage One.** There is one principal, `mycelium_bridge_fpd_r2` (runtime capability), and one Unix identity, `mycmem`. This is **proposed as a bounded Stage One exception for Chris to accept** (only Chris can accept the risk): the recall process holds a credential that can write. Codex agrees it need not block the proof.

Codex is right that two passwords readable by one Unix user are not isolation. Real separation would need:
- a reader template and grant migration;
- a second login, a second Unix user and a second rotation route.

That roughly doubles the persistent footprint, against a small threat. The recall code only selects, and it is not where model output is parsed. Ingestion, which does parse model output, needs to write anyway.

Defences in depth instead:
- **Every recall query runs in a `READ ONLY` transaction.** On Neon this is the driver's `Neon-Batch-Read-Only` mode, verified offline.
- **A complete effective-privilege check runs before use** (§2 F6).
- **Every answer is validated before the first write** (§2 F8).

Revisit when Stage Two introduces recall-only processes (§6 D1).

### Q3. How do interrupted or partial runs recover without duplicates?

**Through one recovery path: re-ingest the exact pinned batch.** Never a model call, never a new snapshot, never a new run id.

**The batch is pinned once and rebuilt identically.** `run` builds `batch.json` from GitHub at one commit, binding:
- the manifest sha256;
- the snapshot digest;
- each turn's task, agent, exact run id, descriptor blob, result blob and result sha256.

Each result's sha256 must equal the one in the gate's own completion event. Recovery rebuilds the batch at the same commit and refuses to continue unless it is byte-identical.

**No write happens until every answer is validated.** The bridge checks every hash, order and agent, parses every answer, and **prepares every contribution through the explorer's own `prepare`** (the same field, limit, id and credential checks the append applies) before it writes anything. Ids are deterministic, so a later turn's `@<task>` link resolves to an earlier turn's id before that turn is written.

**Each contribution is atomic.** A replay is an exact no-op; a changed payload under an existing id is refused.

**A receipt on fpd-prod tracks each batch's state:**
```
PREPARING → PREPARED → CALLS_STARTED → CALLS_DONE → INGEST_PENDING → INGESTED → VERIFIED
```
`CALLS_STARTED` is recorded **before** the allowance exists. If `run` is killed after that point (SIGKILL or power loss, so no exit trap runs), `ingest` reconciles from `CALLS_STARTED`, database-only:
1. It closes any leftover allowance first, and refuses a foreign one.
2. It checks the recorded descriptors against the manifest's turn order.
3. It proceeds only if every turn is `completed` on GitHub. Otherwise the batch becomes `HELD`, with no call and no ingestion, and Chris decides.

A batch:
- runs its turns at most once;
- is never re-prepared;
- reaches VERIFIED only after a **fresh process** finds every prepared row identical to the pinned payload, using the same comparisons the identical-retry check uses. A redacted row is reported as `redacted`, never as exact.

**Tested failure cases:**
- death between contributions;
- a kill after the final completion, before `CALLS_DONE`;
- a kill after the first turn only (`HELD`);
- a lost acknowledgement after commit;
- concurrent duplicate ingestion;
- restart from a fresh process ("another host");
- a malformed second answer;
- a mismatched result or snapshot hash;
- a tampered pinned batch;
- a tampered sealed snapshot.

### Q4. Do the install and gateway changes add unnecessary complexity?

**Less than the first plan did.**

Removed:
- the Git publication route;
- snapshots in Git;
- the separate run wrapper (folded into one host script);
- four ceremonial approvals, now two that follow the natural pause (§5).

Nothing new of these kinds:
- daemon, timer, service, listener, scheduler or sidecar;
- transport;
- GitHub credential;
- change to `myc-agent`, `myc-stageb`, `hubsync`, `mycnotify` or the push contract;
- Node reinstall.

What persists, and is needed by definition:
- one system user;
- a read-only package at a pinned commit;
- one expiring credential;
- a 33-line gate change.

## 2. Codex findings and their resolution

| # | Codex finding | Resolution | Evidence |
|---|---|---|---|
| F1 | GitHub snapshot publication enlarges the writer boundary | **Agreed; withdrawn.** Digest-pinned local `memref` | `test-memref.sh` 15/15; snapshot text absent from Git history |
| F2 | Pin the attachment: no arbitrary path, symlink or TOCTOU; preserve folds/grants | **Agreed.** The path is derived from the digest only; a private copy is checked at claim **and** at admit. A swap between them is refused, recorded as failed with no call | `test-memref.sh` §2–3; fold parity 1/1; all Stage B suites unchanged |
| F3 | Retain the snapshot bytes; retention policy | **Partly.** Retained on fpd-prod, kept by `teardown`, until Chris decides. Not off-host | §6 D3 |
| F4 | A SELECT-only reader needs a distinct Unix identity to mean anything | **Agreed on the analysis;** one principal for Stage One, threat limit accepted | §1 Q2, §6 D1 |
| F5 | Don't rerun `runtime_grants.sql`; don't reuse trial names | **Agreed.** No grant change at all. A new role through new `bridge-provision.mjs`, with its own comment namespace; trial logins stay closed | `stage-one.test.mjs` provisioning test |
| F6 | `whoami` is incomplete | **Replaced** by `scripts/privileges.mjs`. It checks: identity; transitive and settable roles; every relation's table and column privileges in every non-system schema (`neon_auth` and `public` included); executable SECURITY DEFINER functions; schema CREATE; database CREATE; ownership of any object. A missing field fails | 9 grant-drift cases each detected; 13 **real refusals** executed as the role on PG 18.6 |
| F7 | Unix boundary: credential modes alone prove nothing | `whoami` now asserts:<br>• `myc` and `hubsync` cannot read the credential and are not in group `mycmem`;<br>• `mycmem` cannot read the deploy key or the CLI sign-ins;<br>• `mycmem` has no supplementary groups, no sudo rules and no ACLs | Host-only checks: they run live in `whoami`, skipped offline |
| F8 | Bind ingestion to completed, pinned results; validate everything before writing; strict run ids | **Done** (§1 Q3) | `stage-one.test.mjs`: all-or-nothing, binding, strict run id |
| F9 | Recovery receipt; never new snapshot or run id; changed payload fails | **Done** (§1 Q3) | Host rehearsal §6: lost acknowledgement → STOP INGEST_PENDING → `ingest` reconciles with no duplicate and no call |
| F10 | VERIFY must fail on anything missing | **Done** (made exact in revision 2, R4) | `verifyPlanned` tests |
| F11 | "disable-login revokes instantly" is overstated | **Corrected.** Disable = NOLOGIN (no new sessions) + `VALID UNTIL` in the past + REVOKE runtime. In PostgreSQL semantics, REVOKE strips an open session's graph privileges at its next statement. No session termination is proposed | Provisioning test |
| F12 | Persistent credentials need a lifetime, rotation and host-loss response | **Password expiry:** `VALID UNTIL` ≤ **2026-12-31T23:59:59Z**, a ceiling set in code and enforced at every process. It stops only new password logins: membership and open sessions remain until the explicit `close`.<br>**Rotation:** `credential` on fpd-prod, then `before`, `scp` and `rotate` on the PC.<br>**Host loss:** PC `close`; memory is safe in Neon | Owner tests 25/25; host tests |
| F13 | The CLIs share `myc` | **Acknowledged.** They are not mutually isolated principals. Neither gets a database credential, a database route or the snapshot store | §6 D5 |
| F14 | Hard-coded "polymer P" | **Done.** Selection comes from a strict, reviewed manifest at a pinned commit. The optional seed is a `question` (it never asserts), tagged `origin: reviewed-manifest` | [`runs/stage-one-proof-1.json`](../../mycelium/runs/stage-one-proof-1.json) |
| F15 | One run lock; bounded steps; snapshot outside the HubSync clone; always close the allowance | **Done.** One flock covers prepare, run and ingest. Each node step is bounded (90 s, KILL grace). The store is outside the clone. The allowlist is created at `run` from the pinned descriptors and **always** archived, success or STOP | Host rehearsal |
| F16 | One clear approval for an exact scope, not four phrases | **Agreed in spirit.** Two approvals, because the digest must exist before the task descriptors can pin it | §5 |

### 2a. Revision 2: Codex source review `95a13b2b`

| # | Codex finding | Fix | Regression |
|---|---|---|---|
| R1 | PC password copy cleanup fails open; early failures leave the copy; `git diff` ignores the working files; `close` needs GitHub | `before` runs **before** the transfer. It refuses any existing file or link at the destination, then records that exactly one copy is expected. From then on, every check happens inside a block that removes the copy in **every** outcome. Success is reported only if the copy is **verifiably absent** and the login is verified; a copy that cannot be removed is a STOP. An unexpected copy is never touched. The code is checked against the commit *on disk* (tracked differences and untracked files both refused). GitHub is contacted only when the commit is missing, so `close` works offline | Owner tests **25/25**, including: missing or malformed expiry after the transfer → STOP, nothing sent, copy removed; deletion denied (immutable file) → STOP, never success; wrong branch, dirty package or untracked code after transfer → copy removed, nothing sent; unexpected copy untouched; dangling link refused; `close` with GitHub unreachable |
| R2 | A kill after the final completion strands the batch at `CALLS_STARTED`; `verify` races ingestion | `CALLS_STARTED` is made durable before the allowance exists. `ingest` reconciles from `CALLS_STARTED` or `HELD`: it closes the leftover allowance first (and refuses a foreign one), verifies descriptors and order, then continues only if every turn is completed. Otherwise `HELD`, no call. `verify` takes the run lock and uses an isolated collection folder | Host rehearsal §6b: killed after the final completion → reconciled, VERIFIED, 0 calls; killed after turn 1 → HELD, allowance closed, nothing ingested, stays HELD; foreign allowlist untouched; `verify` refused while the lock is held |
| R3 | A credential-pattern second answer passes planning; the first contribution commits | `plan` now calls the explorer's pure `prepare` (split out of `contribute`, same code path) for every contribution. The write appends exactly those prepared inserts | `stage-one.test.mjs` R3: counts unchanged; field-limit failure also caught while planning |
| R4 | `verify` compares only kind, title and run | `verifyPlanned` runs every prepared row's own identical-retry comparison in a READ ONLY process: every field of every node, edge and assessment, provenance and binding attributes included. A row under a redaction is reported as `redacted` | R4: body, binding-attribute and edge-relation mismatches detected; redaction reported, never exact |
| R5 | Limit and expiry are only reported; ADMIN options and grants *to* the login are not checked; `whoami` runs only once | The checker requires: limit exactly 20; a finite expiry, in the future and ≤ the ceiling; direct membership exactly runtime with ADMIN false, INHERIT true, SET false; and the login granted to no role. `bridgeGuard` runs it on the **first connection of every bridge process** (seed, snapshot, ingest, verify, whoami). The Unix boundary is re-checked by prepare, run, ingest and verify. The expiry wording is corrected (F12) | Privilege test: limit −1, infinite expiry, expiry beyond the ceiling, past expiry, ADMIN option and a grant to another role are each detected; `bridgeGuard` refuses a superuser session; rehearsal runs every process through the guard as the restricted role |

Codex's probe files (`stage-one-review-probes.mjs`, `codex-v2-extra-probes.mjs`, `codex-v2-state-probe.sh`) are left exactly as committed. They record the behaviour before each fix, so each now fails at the assertion that reproduced the defect.

Codex's probe file `memory/test/stage-one-review-probes.mjs` is left exactly as committed: it records the behaviour before the fix. It now stops at its first assertion, because the bridge no longer has a hard-coded selection. Each of its four reproductions has an inverted assertion in `test/stage-one.test.mjs`.

## 3. Agreed architecture

```
fpd-prod (root wrapper stage-one/mycelium-bridge.sh; one lock; stop at first failure; never retry)
  prepare: hubsync git show <commit>:runs/<batch>.json ──► mycmem: seed (append, idempotent) ──► mycmem: snapshot (READ ONLY)
           ──► root seals /var/lib/mycelium-memory/snapshots/<sha>.md (root:hubsync 0440) ──► prints "memref: sha256:<sha>"
  [hub: task descriptors carry that memref line; Codex reviews; Chris approves the run at that commit]
  run:     descriptors at <commit> must pin <sha> ──► allowlist created from them ──► INSTALLED myc-stageb per turn
           (myc-gate v3 verifies + embeds the sealed bytes; myc-agent v6 unchanged; CLIs as myc, no credential)
           ──► allowlist archived ──► collect + pin batch from GitHub ──► mycmem: ingest ──► mycmem: fresh verify ──► VERIFIED
Neon: one login mycelium_bridge_fpd_r2 (runtime capability, limit 20, expires ≤ 2026-12-31) — the owner stays on the PC
```

## 4. Exact files and components

| Component | File (repo) | Change | sha256 |
|---|---|---|---|
| Gate | `greenfield/mycelium/stageb/myc-gate` | v2 → v3: `memref` in claim and admit only (+33 lines; nothing removed) | `bca72724623b69439d2876eb4dd9aa3bb11e8b16f75a09f6238dab7e9d962dc1` |
| Gate install | `greenfield/mycelium/stageb/upgrade-gate.sh` | new: check / install / rollback, with byte-verified restore. Takes both the Stage B and hub locks. Asserts every other command unchanged | `4cca25457c66ce66de01e172462fbe0033b444e168431f2175f10e56ac573a8e` |
| Host | `greenfield/mycelium/memory/stage-one/mycelium-bridge.sh` | new: precheck, setup, whoami, prepare, run, ingest, verify, credential, close, teardown | `08f959ec4ab19b29e4ca9752710dca84185c72e0eca8ad259900a7acbae25333` |
| PC owner | `greenfield/mycelium/memory/stage-one/mycelium-bridge-owner.ps1` | new: before, create, rotate, close. The migration owner never leaves the PC | `b87199428459b1b1f1131e3b42c7a9939edcef859e850dabe1e3a7f91766f809` |
| Explorer | `greenfield/mycelium/memory/src/explorer.mjs` | `contribute` split into a pure `prepare` + append (same validation, same inserts); behaviour unchanged | `0d747a44e7680e7b3ad0cc5672ae9e4537b00b2eb01e05c7231530f73e43a471` |
| Bridge | `greenfield/mycelium/memory/scripts/bridge.mjs` | v2: manifest selection, seed, READ ONLY snapshot, pinned batch, prepare-all-then-write, field-exact verify, capability guard on every process. The v1 L2 API is kept, now all-or-nothing | `0b07c64d1ca776b75103611fc3df56cb77003bc0481426f0209bc8a4c39c4fb9` |
| Provisioning | `greenfield/mycelium/memory/scripts/bridge-provision.mjs` | new: bridge login with grant-bound comment, expiry ceiling, rotate, disable | `c9070895fb843272a86bd03b14b526238c1a25b8a1166178b4e11a49d0efca52` |
| Privileges | `greenfield/mycelium/memory/scripts/privileges.mjs` | new: complete effective-privilege check | `159d43f59166550167a10387ee22f02401f0cb53358807990a7e1aeac816cd50` |
| Connection | `greenfield/mycelium/memory/src/connection.mjs` | `readOnly` option | `4888eb135e00a3d0338a617986fea41500d5b20c28ed6c2c96f214424c088224` |
| Manifest | `greenfield/mycelium/runs/stage-one-proof-1.json` | new: the FindPitches-relevant proof manifest | `434d7b09cab3e5d2aaf4a90b79d7c233e4c9bc30402a9d87c3ac1313af96845a` |
| Tests | `stageb/test-memref.sh`, `stageb/test-upgrade-gate.sh`, `memory/test/stage-one.test.mjs`, `memory/test/{helpers,pglite-bridge,pglite-init}.mjs`, `memory/stage-one/test-bridge-{host,owner}.sh` | new | — |
| Updated tests | `memory/test/bridge.test.mjs` (a bad second answer now writes nothing), `collab/test-bridge-chain.sh` (selection argument), `memory/package.json`, `stageb/SHA256SUMS` | — | — |

Full hashes are in `stageb/SHA256SUMS` and in the final verification log of this commit.

**Unchanged on fpd-prod:**
- the commands: `myc-agent` v6, `myc-stageb` v5.1, `myc-decide`, `hubsync`, `mycnotify`;
- timers, keys, `notify.conf`, Node, every service;
- FindPitches V1, V2 and V3, the Pi, Hal.

**On Neon:** the schema, migrations and grants are unchanged. One login role is added.

## 5. Deployment order and the approvals required

**Step 0 (no approval needed).** Codex reviews this patch and the fake-CLI rehearsal at commit **X** (this commit or Codex's amended one). Any change is re-tested and re-hashed.

**Approval 1, exact phrase: "approved: Stage One install at X".** It covers, with no model call:
1. On fpd-prod, copy the three files out of the HubSync clone at X and check them against §4.
2. `sudo bash upgrade-gate.sh check`, then `install`. This installs `myc-gate` v3; rollback is `upgrade-gate.sh rollback`.
3. `sudo bash mycelium-bridge.sh precheck`, then `setup X`. This creates:
   - user `mycmem`;
   - `/opt/mycelium-memory` at X;
   - `/etc/mycelium/bridge.env` (root:mycmem 0640);
   - `/var/lib/mycelium-memory`;
   - one PC password copy.
4. On the PC: `mycelium-bridge-owner.ps1 -Mode before -Commit X` **first**, then `scp` the copy, then `-Mode create -Commit X -ValidUntil 2026-12-31T23:59:59Z`. This creates the Neon role **`mycelium_bridge_fpd_r2`**:
   - LOGIN, CONNECTION LIMIT 20;
   - inherits only `mycelium_memory_runtime`, SET FALSE, no ADMIN;
   - expires at 2026-12-31T23:59:59Z;
   - its comment is bound to a new grant id.

   The copy is removed in every outcome, and success requires it to be verifiably gone.
5. `sudo bash mycelium-bridge.sh whoami`. It shreds the host copy, then runs the Unix-boundary checks and the exact privilege check.
6. `sudo bash mycelium-bridge.sh prepare stage-one-proof-1 X`. Neon writes: **one seed question node**. Then a READ ONLY snapshot, which is sealed. Chris pastes the output, which includes the `memref` line.

**Step 7 (hub, no approval needed).** Claude writes tasks `MYC-20261029-001` (claude) and `-002` (codex), carrying that memref line plus `ref:` to 001's result for Codex. Codex reviews them, and the reviewed commit is **Y**.

**Approval 2, exact phrase: "approved: Stage One proof run at Y".** It covers:
- `sudo MYC_BILLING_CONFIRMED=yes bash /opt/mycelium-memory/stage-one/mycelium-bridge.sh run stage-one-proof-1 Y`;
- **2 model calls** (1 Claude, 1 Codex), a 30-minute window, no model retry;
- ingestion of at most 2 contributions, with fresh-process verification;
- if and only if the run stops at `INGEST_PENDING`, or is interrupted at `CALLS_STARTED`: **one** `mycelium-bridge.sh ingest stage-one-proof-1`. This is database-only recovery of the exact batch, or a `HELD` verdict; there is no model call.

Chris pastes the output, and Claude publishes the receipt to the hub.

**After the proof:**
- New password logins stop at 2026-12-31 at the latest. The membership itself lasts until Chris's `close`.
- It authorises nothing on its own: every later run needs a new task allowlist from Chris.
- Stage Two does not start without its own allowance.

## 6. Remaining disagreements and limits (recorded, not smoothed)

**D1. Reader/writer separation.**
- Codex recommends it for persistent operation.
- I propose to defer it as a bounded Stage One exception. Codex agrees it need not block the proof.
- **Chris's decision** (part of approval 1). A minimal later step would be a SELECT-only template, a reader login and Unix user `mycrecall`.

**D2. Two approvals: resolved.** Codex accepts the natural pause; exact wording is not required.

**D3. Snapshot bytes and batch receipts stay on fpd-prod** (corrected per Codex).
- If fpd-prod is lost mid-batch, that batch cannot be recovered exactly anywhere else, and part of it may already be ingested.
- A replacement batch derives new ids, so it could duplicate that work semantically. My earlier "no duplicate, no loss" claim was wrong for this case and is withdrawn.
- Neon and GitHub themselves lose nothing.
- **Proposed for Chris's acceptance for the bounded proof only.** Before durable operational use, a small off-host recovery record is needed. That would plausibly be an isolated operational table in the existing Neon project; there is no new service.

**D4. Cosmetic.** The unchanged `myc-agent` labels the attachment "(git blob sha256:…)". I am keeping zero agent diff over a label fix.

**D5. Existing trust boundaries, unchanged.**
- Claude Code and Codex share `myc`. Codex's tool ban is partly prompt-only.
- The 900 MiB admission guard is a soft check.
- Connection limit 20 is not a spend cap.

**D6. Untested on Neon until approval 1:**
- `VALID UNTIL` in `CREATE ROLE`. If Neon refuses it, create fails atomically and nothing is created; it then needs a reviewed fallback.
- The live result of the privilege check against `neon_auth` and `public`. A non-empty grant there fails closed.

**D7. Not checked by the privilege query:**
- database `TEMP` (PUBLIC's default, session-scoped);
- `CONNECT` to other databases on the endpoint.

Neither is a graph capability.

## 7. Test evidence (offline, all green at this commit)

**Memory package, `npm test`:**
- 50 node tests, including Stage One **10/10** and the L2 bridge 4/4;
- trial 30/30;
- trial owner 15/15 (pwsh 7.4.6);
- **Stage One host rehearsal 44/44**: the real runner with fake CLIs, and PGlite as the bridge role, every process through the guard;
- **Stage One owner 25/25** (run here under pwsh 7.4.6; Codex has no PowerShell, so this one is Claude-reported).

**Runner suites:**
- Stage B 48, decisions 33, runner decisions 29, upgrade-decisions 16, upgrade-runner 13, review regressions 7 + 3 + 2;
- fold parity 1;
- **memref 15**;
- **upgrade-gate 9**.

**Other suites:**
- bridge chain 7, collab chain 12;
- hubsync 27, mycnotify 31;
- install-node 15.

No model calls, no network, no Neon, no root.

**Rollback**, each step independent:
- **gate:** `upgrade-gate.sh rollback`;
- **credential:** PC `close`, then host `close`;
- **install:** host `teardown`, which keeps the evidence store;
- **memory:** append-only. An unwanted contribution goes through the sanctioned redaction path (owner, PC).

## 8. Sign-off

- **Claude:** proposes this scope at this commit.
- **Codex:**
  - review of revision 1 → [`95a13b2b`](STAGE_ONE_REPLY_CODEX_REVIEW_2026-10-29.md): five defects, now fixed;
  - revision 2 → [`ae32a110`](STAGE_ONE_REV2_CODEX_REVIEW_2026-10-29.md): architecture suitable, R2–R5 addressed, one R1 cleanup path left (fixed in 2a);
  - *final confirmation of 2a pending.* Codex says it supports the narrow install scope after this fix, with the two limits stated as Chris's decisions.
- **Chris:** approvals 1 and 2 (§5) only after Codex's sign-off.

Stage Two remains unstarted.
