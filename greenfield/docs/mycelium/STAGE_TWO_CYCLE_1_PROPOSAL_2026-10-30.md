# Stage Two cycle 1: the first autonomous, artifact-producing BRIX collaboration cycle (PROPOSAL, 30 Oct 2026)

**Status:** prepared offline by Claude. **Next:** Codex reviews it independently. Nothing here has run on fpd-prod, and no model was called.

**What Chris is asked to approve, at the end:** two exact phrases (§3).
- The first allows host changes, with no model call.
- The second allows **at most 6 model calls** within one hour.

## 1. What the cycle does

Codex and Claude take turns: Codex, Claude, Codex, Claude, Codex, Claude. The handoff and the scoring happen through the **existing** runner: myc-gate, myc-stageb, myc-agent, and the Stage One Neon bridge. Chris relays nothing.

```text
turn k answer (files + predictions + contribution)
  └─ myc-stageb v5.2 step 3b: myc-post (root, pinned code)
       ├─ extract: only the agent's own namespace; limits; credential scan
       ├─ evaluate in an OS sandbox (user mycexp, no network, no home, no state paths): every mechanism × every case × 6 seeds
       ├─ run the workbench tests in a separate sandboxed copy
       ├─ score predictions HELD/FAILED; progress record; STALL after two non-progress turns
       └─ append "Workbench result" to result.md (≤16 KB): scoreboard, verdicts, progress, the NEXT agent's own current files
  └─ myc-gate complete: the result is committed to GitHub
turn k+1 claims: `ref:` turn k's result.md (resolved at claim) + the same sealed memory snapshot (memref)
end (or STALL): bridge ingests each turn's contribution into Neon and verifies it in a fresh process
```

- **Where the code lives.** Agents write code, cases and tests as fenced `mycelium-file` blocks. The CLIs stay tool-less (`--tools ""` for Claude, `--sandbox read-only` for Codex). The code becomes runnable only through pinned root code.
- **What each agent works from.** Each turn acts on the other agent's actual scored results and its own current code, not on a summary.
- **Shared records.** GitHub holds the code and the results; Neon holds the reasoning record; the runner holds the handoffs.
- **The research question.** Which mechanism should generate and allocate Mycelium's inquiry? The candidates are Claude's H1, H2 and H3, Codex's C1 and C2, or something new. The test bed is a pinned workbench, where each mechanism is compared with an fpd-like fixed crawl that has a watch list.
- **Where both agents start.** `brain/workbench/CYCLE_BRIEF.md` states both hypothesis families, the evidence (including Codex's audit), the contract and the starting scoreboard. It is turn 1's `ref`.

**Starting evidence** (6 seeds, paired difference in verified finds against `baseline-fixed`). Claude's corrected H1:

| Case | H1 vs fixed |
|---|---|
| e0-corrected | +107 ± 7 |
| enumerable-source | +73 ± 5 |
| churn-and-noise | +1 ± 4 |
| **unlearnable-decoy** | **−19 ± 5** |
| **weak-cues-cycles** | **−50 ± 2** |

No mechanism beats the fixed baseline everywhere. That is the open problem the cycle attacks.

## 2. The package (commit X = the commit carrying this document, or Codex's amended one)

| Piece | Path under `greenfield/mycelium/` | Offline evidence |
|---|---|---|
| Workbench: world, evaluator, baselines, H1, 5 cases | `brain/workbench/{world,evaluate}.mjs`, `mechanisms/`, `cases/` | `node --test brain/workbench/test/*.test.mjs`: **8/8**. Covers the observation-only view, the leak test, the vm boundary, determinism, case validation, pairing, cache and focus |
| Artifact extraction and prediction scoring | `brain/workbench/post/apply.mjs` | Part of `test-post.sh` |
| Post-processor (root, sandboxed evaluation) | `stageb/myc-post` | `bash stageb/test-post.sh`: **17/17**. Covers namespace refusal, scoring, the 16 KB rule, files carried to the next turn, repeat/cosmetic/prose = no progress, a new test = progress, STALL, NOT RUN, and the selftest (negative, and positive under an `unshare -n` + `setpriv nobody` stand-in) |
| Runner hook | `stageb/myc-stageb` v5.2 | Existing suites unchanged and green: stageb 48, runner-decisions 29, review-regressions 7, memref 15 |
| Checked host install and rollback | `stageb/install-cycle.sh` | `bash stageb/test-install-cycle.sh`: **9/9** (install, a failing selftest undoes everything, rollback, refusals) |
| Bridge: cycles | `memory/scripts/bridge.mjs`, `memory/stage-one/mycelium-bridge.sh` | `bash memory/stage-one/test-cycle-host.sh`: **17/17**. The real runner with fake CLIs and PGlite as the bridge role. It covers `upgrade-package` and its rollback; dependencies are reused, with no npm download, when the lockfile is unchanged; a stall after 4 turns ingests the 4-turn prefix and verifies it; 6 progressing turns are ingested and verified; a wrong hook hash is refused before any allowlist or call |
| Cycle manifest, turn template, descriptor builder | `runs/stage-two-cycle-1.json`, `runs/stage-two-cycle-1.turn.txt`, `runs/make-cycle-tasks.mjs` | `bash runs/check-cycle-package.sh`: the manifest parses under the bridge's rules; all 6 descriptors are within the gate's 4096 bytes, with exactly 1 memref and 1 ref each; the brief's scoreboard equals what the pinned workbench computes now |
| Brief, and Claude's response to Codex | `brain/workbench/CYCLE_BRIEF.md`, `collab/stage-two-claude-response-to-codex.md` | — |

The whole memory package passes `npm test`, which now includes the cycle rehearsal. Pinned hashes are in `stageb/SHA256SUMS`:
- `myc-stageb` v5.2: `7445ad75…`;
- `myc-post`: `b1c849b2…`;
- `myc-gate` v3 and `myc-agent` v6 are unchanged (`bca72724…`, `d173813b…`).

The bridge's `run` refuses a workbench batch unless the installed `myc-post` and `myc-stageb` have exactly the reviewed hashes.

**Unchanged:**
- `myc-gate`, `myc-agent`, `myc-decide`, `hubsync`, `mycnotify`, timers, keys and `notify.conf`;
- the Neon schema, roles, grants and the `mycelium_bridge_fpd_r2` login;
- FindPitches V1/V2/V3, the Pi, Hal, Cloudflare, Stripe, email and billing.

No new service and no new network access are involved. Inside the sandbox the evaluator has **no** network at all.

## 3. Approvals and exact steps

**Step 0 (no approval needed): Codex's independent review of X.**
- Codex may amend the package, including the brief, the turn template and the progress rule. Any change is re-tested and re-hashed.
- Codex is first in the cycle on purpose: Claude wrote the brief and the starting mechanism.

**Approval A, exact phrase: "approved: Stage Two cycle-1 install at X".** No model call. Chris runs these on fpd-prod (`ssh ct_admin@fpd-prod.Home`) and pastes the output:

1. Copy the four files out of the HubSync clone at X, and check them against `stageb/SHA256SUMS` and §2:
   ```bash
   C=X; D=~/cycle1; mkdir -p $D
   for f in stageb/install-cycle.sh stageb/myc-stageb stageb/myc-post memory/stage-one/mycelium-bridge.sh; do
     sudo runuser -u hubsync -- git -C /var/lib/hubsync/repo show "$C:greenfield/mycelium/$f" > "$D/$(basename "$f")"; done
   sha256sum $D/*
   ```
2. Install the hook:
   - `sudo bash $D/install-cycle.sh check`, then `sudo bash $D/install-cycle.sh install`.
   - This installs `myc-stageb` v5.2 and `/usr/local/bin/myc-post`, the system user `mycexp` (no home, no shell, no login) and `/var/lib/mycelium-workbench`.
   - The **sandbox selftest must pass**: it checks that the code runs as a non-root user, cannot read secrets, cannot write the system, and has no network. Otherwise everything is undone automatically.
   - Rollback: `install-cycle.sh rollback`.
3. Upgrade the bridge package:
   - `sudo bash $D/mycelium-bridge.sh upgrade-package X`. It replaces `/opt/mycelium-memory` (13503084 → X) and keeps the old copy.
   - The login, credential, store and receipts are untouched.
   - Dependencies are reused because the lockfile is unchanged.
   - Rollback: `upgrade-package 13503084`.
4. Re-check the boundary and privileges against Neon (read-only): `sudo bash /opt/mycelium-memory/stage-one/mycelium-bridge.sh whoami`.
5. Prepare the batch: `sudo bash /opt/mycelium-memory/stage-one/mycelium-bridge.sh prepare stage-two-cycle-1 X`.
   - Neon writes: **one seed question node**. The snapshot is READ ONLY and sealed.
   - The output includes the `memref` line.

**Step 6 (hub, no approval needed): the descriptors.**
- Claude runs `node runs/make-cycle-tasks.mjs stage-two-cycle-1 <digest> --write`. This writes `tasks/MYC-20261030-001…006`, each with a `chris` creation event that cites Approval A. Claude commits them as **Y**.
- The builder is deterministic, so Codex can review them by re-running it at Y.

**Approval B, exact phrase: "approved: Stage Two cycle-1 run at Y".** It covers exactly:
- one command: `sudo MYC_BILLING_CONFIRMED=yes bash /opt/mycelium-memory/stage-one/mycelium-bridge.sh run stage-two-cycle-1 Y`;
- **at most 6 model calls**: 3 Codex (turns 1, 3, 5) and 3 Claude (turns 2, 4, 6), one CLI invocation each;
- each call has the existing 180 s cap, no model retry, and a **60-minute** window from the first claim;
- turns run in order. The run stops at the first failure, decision request, refused claim or **STALL**;
- at most 6 contributions are ingested into Neon, then verified in a fresh process;
- one recovery is allowed: if the run stops at `INGEST_PENDING` or is interrupted at `CALLS_STARTED`, Chris may run one `mycelium-bridge.sh ingest stage-two-cycle-1`. This is database-only, for the exact batch, or it ends in a `HELD` verdict. It makes no model call.

Chris pastes the output, and Claude publishes the receipt and the results summary to the hub. **Billing condition (unchanged):** Claude usage credits are off, and no Codex credits or API key are in use. That is what `MYC_BILLING_CONFIRMED=yes` affirms.

## 4. Success criteria

**Mechanics: pass/fail, judged from receipts and GitHub.**
1. Every executed turn's `result.md` on GitHub carries a machine-written "Workbench result" section, within the gate's limits.
2. Every turn after the first received the previous turn's result through `ref:`. This is visible in the claim's ref blob, which equals the previous result's blob.
3. No artifact outside the turn agent's namespace entered the tree. Each REJECTED line is shown with its reason.
4. The batch ends `VERIFIED`, either for all 6 turns, or for the completed prefix after a STALL.
5. The allowlist is archived and no unrun turn was claimed.
6. Usage stays within the allowance: ≤ 6 calls and ≤ 60 minutes.

**Engineering progress: measured and reported, not targets that can be gamed in advance.** The receipt tabulates these from `progress.jsonl` and the final scoreboard:
- **Per turn:** artifacts accepted, rejected, and new; whether the scoreboard moved; new tests; workbench tests passed and failed; predictions HELD, FAILED and UNSCORED.
- **Totals:** new mechanisms per agent; adversarial cases per agent, and on whose mechanism each one changed the ranking; defect-exposing tests.
- **The research result:** the best `verifiedVsBaseline` per case, and whether any mechanism now beats `baseline-fixed` on every case, which none does at the start. Also, which claims were retired by evidence (a FAILED prediction counts as a result).
- **The cycle succeeds as engineering if** at least 4 of the executed turns record progress, **and** each agent lands at least one scored mechanism or case.
- **A STALL is a legitimate, informative outcome, not a failure of the mechanics.** It stops early, saves the remaining calls, and is reported with the turns that caused it.

**Stagnation and loop control (enforced by code, not by promise):**
- Progress means a new or changed file that **moves the scoreboard** (a new mechanism or case always does; a cosmetic edit does not) or a new or changed test.
- Prose-only turns, re-sent identical files and cosmetic edits are **no progress**. Two in a row trigger a STALL, and the bridge runs no further turn.
- Each turn's progress record is on the host and summarised in `result.md`, so the next agent and the reviewers see it.

## 5. Resource figures (expected; the hard limits are in §3)

| Resource | Expected |
|---|---|
| Model calls | ≤ 6 (Stage One calls took 15–40 s each). An answer that carries ≈12 KB of code is ≈4–6k output tokens, ≈60–120 s |
| Tokens per call (input) | ≈ 8–15k: prompt, snapshot, brief or previous result (≤16 KB) |
| BRIX CPU per turn | Sandboxed evaluation ≤ 150 s plus tests ≤ 60 s, at `CPUQuota=200%` and `MemoryMax=768M`. The first turn's uncached evaluation is ≈ 40–60 s; later turns use the cache |
| Disk | Workbench tree, cache and per-turn copies: < 50 MB under `/var/lib/mycelium-workbench/stage-two-cycle-1` |
| Neon | 1 seed node in `prepare`, then ≤ 6 contribution nodes with their links, a few KB in total. Short bursts within the free plan's 100 CU-h/month; the endpoint scales to zero afterwards |
| Money | None. Subscription CLIs only; no API keys, credits or paid services |

## 6. Recovery and rollback

| Situation | What happens |
|---|---|
| The selftest fails at install | `install-cycle.sh install` undoes everything itself and the host returns to v5.1 |
| A later problem with the hook | `install-cycle.sh rollback` restores v5.1 and removes `myc-post` and `mycexp`. Workbench evidence is kept |
| A bridge package problem | `upgrade-package 13503084` |
| The run is interrupted | The receipt state machine applies (`CALLS_STARTED` → `reconcile_calls`). One `ingest` recovers the exact pinned batch, or ends `HELD` |
| Evaluation fails or times out | That turn's result says `NOT RUN` or reports the timeout. The answer is still recorded unchanged; the turn makes no progress, and two such turns stop the cycle |
| A turn fails, asks for a decision, or its claim is refused | The bridge stops. No further turn runs and Chris decides |
| The window runs out | Later claims are refused by the gate's grant. The completed prefix is recovered with one `ingest` |

## 7. Limits and risks (recorded, not smoothed)

1. **The node `vm` is a fairness boundary, not a security boundary.** Security comes from the OS sandbox: systemd `User=mycexp`, `PrivateNetwork`, `IPAddressDeny=any`, `ProtectSystem=strict`, `ProtectHome`, `InaccessiblePaths` and resource limits. That sandbox can only be proven on fpd-prod, which is why the install selftest must pass.
2. **Agents write code blind.** The CLIs cannot run code, so feedback arrives one turn later. Code that fails to load is reported as a failure for that mechanism and costs the agent a turn.
3. **`myc-agent` still says "at most 400 words"** (zero agent diff, as in Stage One D4). The task says this applies to prose only. A model may still shorten code.
4. **The memory snapshot is sealed at `prepare`.** Within cycle 1, continuity comes through the chain of results, which includes each agent's own current files. Contributions reach Neon at the end and are available to the next cycle's snapshot.
5. **The progress rule can be gamed weakly:** a trivial new case or test still counts. Every artifact is listed per turn, so reviewers and the other agent can call it out; cycle 2 can tighten the rule with evidence.
6. **`cpuMs` is measured, not deterministic.** Predictions about it are noisier than those about `verified`, which is deterministic per seed.
7. **Unchanged trust boundaries (Stage One D5):** both CLIs run as `myc`; Codex's tool ban is partly prompt-only; the admission guard is soft.
8. **Claude wrote the brief and the first non-baseline mechanism.** Mitigations: Codex reviews the package and may amend it, Codex moves first, and the fixed endpoint and baselines were adopted from Codex's audit.

## 8. Not authorised by this proposal

- Any call beyond the six above, or any rerun of a turn.
- Continuous or scheduled operation.
- Cycle 2. It needs its own manifest, review and approval.
- Any change to the Neon schema, roles or credentials.
- Any new network access.
- Any customer contact or publication.
- Any change to FindPitches production, billing, the Pi, Hal or email.
