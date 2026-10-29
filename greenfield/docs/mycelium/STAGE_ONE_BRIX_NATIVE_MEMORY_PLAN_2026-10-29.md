# Stage One: BRIX-native Neon memory (Claude plan, 29 Oct 2026)

Answers the [owner mission directive](OWNER_MISSION_DIRECTIVE_2026-10-29.md) §5. It is a **plan only**: no call, credential, host or Neon change has been made. It reuses the [L2 bridge](SHARED_MEMORY_ADAPTER_DELIVERY_2026-10-28.md) proven in `1c98e06c`. Codex is asked for an independent critique (§8) before Chris approves anything.

## 1. Understanding and boundaries

- **The organism.** Mycelium is an open-ended, branching exploratory engine. The runner, approvals, hub and bridge are the scaffolding we use to *build* it; they are not its brain.
- **The roles of each part:**
  - **Neon** is durable shared knowledge;
  - **GitHub** is coordination and audit;
  - **Claude and Codex** are reasoning tools the engine invokes;
  - **`fpd-prod`** is the first host.

  Each must stay separable and portable, and knowledge and recovery must survive the loss of `fpd-prod`.
- **The mission.** FindPitches (verified, actionable vendor opportunities) is the first mission, implemented as a replaceable domain adapter, never as brain logic.
- **Out of bounds:**
  - FindPitches V1/V2/V3, production data, Cloudflare, Stripe, email, other BRIX/Pi services and Hal;
  - any new paid service or database;
  - any unattended loop.
- **Approvals.** Every real execution window needs its own approval.

**Stage One is narrow.** Move the bridge's two Neon operations, snapshot and ingest, from Chris's PC onto `fpd-prod`, using a dedicated least-privilege principal, with no Windows in the operational path. Everything proven so far is kept.

## 2. Inspected reality (what exists today)

| Piece | State | Consequence for Stage One |
|---|---|---|
| `memory/scripts/bridge.mjs` | Snapshot (read-only recall to a fenced ref) and ingest (strict JSON block to append-only contribute) work. **Both call `assertDeploymentTarget`, which accepts only the owner role** | It must accept a restricted bridge login instead. It must never accept the owner |
| Explorer adapter, `explorer-live.mjs`, `explorer-provision.mjs` | Least-privilege login provisioning is proven on Neon (attempt-bound comment, plain-text password over TLS, `INHERIT TRUE, SET FALSE, ADMIN FALSE`, limit 20), along with `whoami` privilege refusal and close/verify | Reuse as-is, with the role name parameterised |
| Neon roles | `mycelium_memory_runtime` (template: graph SELECT/INSERT, no mutation, no redaction). `mycelium_explorer_fpd` and `mycelium_explorer_fpd_r5` are **NOLOGIN, membership revoked, passwords shredded**, and bound to closed trial attempts | **Neither is reused.** Stage One creates one new persistent principal |
| fpd-prod trial tooling (`trial/mycelium-explorer-trial.sh`) | Receipt-scoped setup of user `mycmem`, `/opt/mycelium-memory` and `/etc/mycelium` (0750 root:mycmem); fully torn down after attempt 4 | Reuse its setup logic as a *persistent* install: same refusals and receipts, no teardown by default |
| Node | v22.23.4 at `/usr/local/bin`, approved and installed | No change |
| Runner (`myc-gate`, `myc-agent` v6, `myc-stageb` v5.1) | The CLIs run as `myc`, with refs embedded from pinned **GitHub** blobs. **`myc-gate` is the single Git writer and refuses any file other than task events and results** | **The one real gap:** a snapshot made on fpd-prod has no path into GitHub. On the PC it went through Chris's `git push` |
| HubSync | Its SSH deploy key (write access) is used by `myc-gate` | No new GitHub credential is needed if `myc-gate` publishes the snapshot |

## 3. Minimal diff (5 changes, all reviewable offline)

1. **A dedicated bridge principal: `mycelium_bridge_fpd`.**
   - **Grants:** it inherits only `mycelium_memory_runtime`, with limit 20, using the existing provisioning code and an attempt-bound comment.
   - **Persistence:** it is persistent, not a trial login.
   - **New modes:** `rotate-login` (new password through the same SSH-copy gate) and `disable-login` (immediate revocation).
2. **`bridge.mjs`: target guard.** It accepts **only** `mycelium_bridge_fpd` on the pinned host and database, and refuses the owner and every other role, mirroring `assertExplorerTarget`. Both modes first run the existing `whoami` least-privilege check. Paths are parameters, so it can run from a spool.
3. **A new, narrow `myc-gate publish-snapshot <task> <file>`.**
   - **What it publishes:** exactly one new file at `greenfield/mycelium/memory-snapshots/<task>.md`.
   - **Its own guards:**
     - the file must not already exist on GitHub;
     - ≤ 24 KB, clean UTF-8, the exact fence header, and no credential pattern;
     - nothing else in the commit;
     - never forced.
   - **What stays as it is:** `myc-gate` remains the single Git writer. The shared fold-validator block, and so the notifier's parity, is **unchanged**, and there is no new GitHub credential.
   - **Install:** through a checked `upgrade-gate.sh` with rollback, in the established pattern.
4. **A persistent BRIX bridge install,** derived from the trial `setup`:
   - user `mycmem`, with no shell and no home, **not** in the `myc` or `hubsync` groups;
   - `/opt/mycelium-memory` at a pinned commit, root-owned and read-only;
   - `/etc/mycelium/bridge.env` at root:mycmem 0640.

   The owner credential never goes to fpd-prod.
5. **`mycelium-bridge-run.sh`** (on fpd-prod, one command, manual, bounded) chains **existing** pieces only:
   1. `snapshot` as `mycmem`;
   2. `publish-snapshot` as `hubsync`;
   3. the existing two-turn launcher (`myc-stageb`; 2 calls; allowlist; billing confirmation);
   4. `git show` of the two results as `hubsync`, into a root spool;
   5. `ingest` as `mycmem`;
   6. a **fresh-process** read-only recall of the new nodes and edges, as `mycmem`.

   It stops at the first failure and never retries. There's no scheduler, sidecar or new transport.

**Considered and not chosen:**
- **(a) Embed a local snapshot in the prompt.** `myc-agent` would append a root-spool file to the prompt. That changes the agent and loses the GitHub audit of what the models saw.
- **(b) Give the bridge user its own GitHub key.** A second writer and credential, scoped to the whole repo.
- **(c) Keep the PC for the snapshot.** That fails the directive.

## 4. Threat and privilege model

| Risk | Control |
|---|---|
| Owner or redaction power reaching fpd-prod or an agent | The owner exists only in the PC's ignored `.env.local`. Provisioning and rotation run there, setup only and outside the operational path. The bridge guard refuses the owner. `mycelium_bridge_fpd` has no redaction, DDL or mutation rights. `whoami` re-checks this before every operation |
| A CLI reading the database credential (Codex's tool ban is prompt-only) | The credential file is root:mycmem 0640 and the CLIs run as `myc`, which is not in that group. The CLIs never receive a credential, connection string or SQL route. They see only the published snapshot and return only text |
| Prompt injection via memory, or poisoned contributions | The snapshot is fenced untrusted data. Ingest takes **only** one strictly validated JSON block: ids must come from the snapshot or an earlier turn, fields are bounded, there's a secret refusal and no SQL from model text. Rows are append-only and tagged `model_written`, with declared provenance. Contested content is challenged with stances, never edited |
| Password exposure | Generated on fpd-prod, used once over SSH and TLS for provisioning, then wiped on the PC; never in chat, hub, logs or prompts. Rotation uses the same route. The connection-string scrubber stays in every error path |
| Runaway use or cost | No timer and no automatic dispatch. Every run is one manual command, with a per-run call cap through the existing allowlist. Neon connection limit 20; the capacity admission guard holds memory at 900 MB |
| A bad `myc-gate` change | A narrow new subcommand with the existing suites rerun (Stage B, decisions, runner, fold parity, notifier), plus new tests. Installed through a checked upgrade with byte-verified rollback |
| Loss of fpd-prod | All knowledge is in Neon and GitHub. On another host: rotate or disable the login and reinstall from the pinned commit. Deterministic ids keep a re-ingest from duplicating anything |

## 5. Test criteria

**Offline (no approval needed):**
- the existing suites still pass;
- the bridge guard refuses owner and foreign roles;
- `publish-snapshot` refuses a second file, an oversize file, a bad header, a credential pattern and extra paths, and its push contains exactly one file;
- a persistent-install collision and preservation suite, as for the trial;
- an end-to-end rehearsal with the **real** runner and fake CLIs: snapshot → publish → 2 turns → ingest → fresh-process recall.

**Live success proof (needs approval; the directive's criteria):**
- on fpd-prod only, with no Windows step during the run;
- `whoami` shows `mycelium_bridge_fpd` least-privilege;
- the snapshot is published by `myc-gate`;
- Claude, then Codex, take turns, with Codex responding to Claude's findings;
- both validated contributions are appended, linked to memory and to each other;
- **a fresh process retrieves them;**
- a re-ingest is a no-op (idempotency);
- usage receipts (call count and timings);
- the allowlist is archived;
- no owner credential and no unrecorded change.

## 6. Recovery and stop

- **Stops:** any STOP ends the run, and nothing is retried.
  - Before a claim, nothing is spent.
  - After a claim, the grant is held, as tested.
- **Closing the grant:** the allowlist is always archived.
- **The credential:** stays in place between approved runs; that's the point of Stage One. `disable-login`, run from the PC, revokes it instantly, and `rotate-login` replaces it.
- **Removing the install:** `teardown` removes only recorded artifacts.
- **Memory is never deleted.** Any unwanted model text has the sanctioned redaction path, an owner action off fpd-prod.

## 7. Approvals needed (each separate, each exact)

| # | What | Phrase |
|---|---|---|
| A | Install the `myc-gate` upgrade (`publish-snapshot`), checked and with rollback | "approved: myc-gate publish-snapshot upgrade" |
| B | Persistent BRIX bridge install (`mycmem`, `/opt/mycelium-memory`, `/etc/mycelium`) | "approved: persistent BRIX bridge install" |
| C | Create the persistent Neon login `mycelium_bridge_fpd`: runtime-only, limit 20, through the SSH-copy gate from the PC, one time | "approved: create mycelium_bridge_fpd" |
| D | One Stage One proof run: 2 model calls (1 Claude, 1 Codex) on a FindPitches-relevant snapshot topic, at most 2 contributions, 30-minute window, plus the closures and receipts in §5 | "approved: Stage One proof run" |

A–C are infrastructure that persists. D is a bounded execution window. Stage Two needs its own allowance afterwards (§9).

## 8. Coordination with Codex

Codex is asked, through the hub, for an **independent critique** of §3 before Chris approves:
- Is `publish-snapshot` really the smallest safe route, compared with option (a)?
- Should snapshot and ingest use **separate** principals (a new SELECT-only reader template, plus the runtime writer)? That would tighten capabilities further, at the cost of one more role and grant migration.
- Are there gaps in §4?

Disagreements are recorded, not smoothed over. No model call is needed for this; Codex works through its usual hub route.

## 9. Stage Two (recorded, not started)

After the Stage One proof, Claude and Codex begin the brain-design programme on the working BRIX/Neon system. It covers the mechanisms the directive lists in §6, recorded as linked memory, and a smallest working prototype compared against baselines. The first execution-window request will be submitted separately once Stage One is proven, with an exact call budget, duration, scope and stop conditions. **No Stage Two run starts before that approval.**
