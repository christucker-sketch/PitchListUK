# BRIX memory-design exchange: bounded run proposal (Claude, 28 Oct 2026, revision 2)

**Revision 2** makes the factual corrections from the [Codex review](BRIX_MEMORY_COLLAB_CODEX_REVIEW_2026-10-28.md). R1: a stop before a claim does not hold the grant, so the allowlist is archived on any STOP. R2: Codex's tools are prohibited by the prompt, not removed. It also states the call count as CLI invocations and the 60-minute bound as claim-to-publication. No code, descriptor, limit or test changed; the context pack's tools line is reworded to an instruction.

Answers the [course correction](MEMORY_SCHEMA_COLLABORATION_2026-10-28.md#correction--use-the-existing-brix-cli-collaboration-runner): the installed Claude Code and Codex CLIs on fpd-prod design Mycelium's memory schema through the installed `myc` runner (`myc-stageb` v5.1 `c636582c…`, `myc-agent` v6 `d173813b…`, `myc-gate` `a74add4e…`). **Nothing has run.** This is source, a context pack and offline tests only. No task exists in `tasks/`, no allowlist, no model call, no host change. **It grants nothing until Chris approves it explicitly.**

## What the installed runner can and cannot do (stated plainly)

**It supports sequential handoff only.** One `myc-stageb` run is one claim and at most one model call by one CLI. There is no simultaneous session, no peer-to-peer channel and no autonomous iteration in v6 + v5.1. What it *does* support, unchanged:

- **Cross-CLI input without a human relay.** A task's instructions may carry up to two `ref:` lines. A ref to `tasks/<id>/result.md` is refused at claim unless that task is `completed`. Otherwise the gate pins the blob at claim, and `myc-agent` puts the text, verbatim, into the next CLI's prompt. So Codex reads Claude Code's unedited answer, and the reverse, through GitHub. Nobody copies or edits anything.
- **Exact limits from GitHub history.** These are not local state:
  - a call cap counted across the allowlisted tasks (`MYC_MAX_CALLS`);
  - a window from the first claim (`MYC_WINDOW_S`);
  - **hold on any** failed, quarantined, awaiting or in-progress task.
- **Fail-closed output.** A result or a decision request is the only output. A decision request pauses the run for Chris.

**The gaps this test will make visible (not pretended away):**

1. **The turns are fixed in advance.** There are four turns, in a set order. A CLI cannot open a fifth turn, pick its peer or branch the conversation. This is the main distance from the founding vision's open-ended growth; it is the comms layer, not Mycelium.
2. **No memory between turns.** Each call is fresh (`--no-session-persistence`, Codex `--ephemeral`). Continuity is only the context pack plus the previous answer. Each CLI is told to restate what the next one needs.
3. **The prompt asks for at most 400 words per answer** (the installed `myc-agent` text). The hard cap is a 16 KB result.
4. **Tool use is removed for Claude, but only prohibited for Codex** (Codex review R2). Claude Code runs with `--tools ""`, so it has no tools. Codex runs `exec --sandbox read-only` in a fresh empty work folder with user config and rules ignored. That blocks writes, not tools: the "do not run commands or use tools" line in the installed prompt and in the context pack is an instruction Codex could in principle ignore, and the fake-CLI tests cannot prove it never does. A hard tool denial for Codex would be a separate capability, not in this run. Neither CLI is asked to run SQL or tests. **The offline schema test evidence therefore comes afterwards**: the cloud agents implement turn 4's consolidated delta and its test scenarios in PGlite and publish them. That is reviewable code, not relaying.
5. **One human command launches it.** Chris runs one launcher; after that no human touches content until the end.

## The exchange

| Task | CLI | Refs (all ≤ 32 KB, clean UTF-8) | Turn |
|---|---|---|---|
| `MYC-20261028-001` | Claude Code (sonnet) | context pack | Opens: explores freely what memory must let the network do; numbered C points, each essential-now or speculative; questions for Codex |
| `MYC-20261028-002` | Codex | context pack + 001 `result.md` | Answers every C point (PostgreSQL 18 practicality, Neon Free 1 GB); adds X points; compact SQL delta; questions for Claude |
| `MYC-20261028-003` | Claude Code | context pack + 002 `result.md` | Accepts, challenges or cross-connects each point; fixes the weakest part of Codex's SQL; says what it changed because of Codex |
| `MYC-20261028-004` | Codex | context pack + 003 `result.md` | Consolidates: agreed SQL delta, origin and disposition per point (what changed because of the peer), open trade-offs for Chris, 5–8 PGlite test scenarios |

**Inputs, all in Git:**

- **[Context pack](../../mycelium/collab/memory-design-context-2026-10-28.md)** (9,355 bytes, sha256 `478f844a…`). It contains the founding vision verbatim, `001_memory.sql` and `memory.mjs` verbatim, environment facts, and the exchange rules: free exploration, no lanes, number your points, answer by number, restate for the next CLI, never use the decision envelope.
- **[Descriptors](../../mycelium/collab/proposed-tasks/)** (five-field contract, instructions 765–904 bytes). The pinned blobs are:
  - 001 `f6f95fba672dfbe3f0da7c57ce5b7c47901991e5`
  - 002 `e085a918658e70703fdbfcf54837f0fbb259cbf0`
  - 003 `c5ed9dc8e5c3210035cb8c3f08d672f8aaa562ac`
  - 004 `765d5b276be71198e851a103dc87a6aec08846ba`

My earlier cloud-session critique is **kept out of the pack on purpose**. It is preserved as [preparatory notes](MEMORY_SCHEMA_CLOUD_CLAUDE_PREP_NOTES_2026-10-28.md), so the CLI exchange stays independent and can be compared against it afterwards. The turn-1 prompt does not hint at its findings.

## Limits and safeguards

| Limit | Value | Enforced by |
|---|---|---|
| Calls | **at most 4 CLI invocations**, one per task, no orchestrator retries. This counts admitted runs, not the provider's internal requests: Claude's retries are set to zero; the Codex command has no explicit retry override. | `myc-gate` claim cap `MYC_MAX_CALLS=4` over the 4-line allowlist; a finished or failed task can never be claimed again |
| Per call | ≤ 180 s (TERM, then KILL to the process group) | `myc-agent` `MYC_CALL_TIMEOUT` |
| Whole run | claims, admissions and publication within 60 min of the first claim (expected ~15). This bounds the model work, not the launcher's own checks or the cleanup. | `MYC_WINDOW_S=3600`; each claim's lease is 30 min |
| Order | 002 cannot start before 001 completes, and so on | the gate's ref rule (completed only) **and** the launcher |
| Stop | any non-`completed` turn stops everything | the launcher, and the gate's hold on failed/awaiting/quarantined/in-progress |
| Billing | £0 expected, **conditional on Chris's checks** (the fixtures are not a billing audit): 2 Claude calls on the subscription, 2 Codex calls on the ChatGPT plan, no API keys | the installed `myc-run` billing guard (`~myc/bin/myc-run`), `MYC_BILLING_CONFIRMED=yes` after Chris checks Claude extra usage OFF and no Codex credits/API key, and each turn's sign-in preflight before any claim |
| Size | instructions ≤ 4096 B, 2 refs × ≤ 32 KB, result ≤ 16 KB, credential-pattern refusal | `myc-gate` |
| Notifications | none: the notifier stays `MODE=dry-run`, empty PIN, timer off | unchanged |

**The fail-closed stop** (corrected per Codex review R1). Any `STOP:` ends the run where it is, and nothing retries. Two kinds of stop differ:

- **After a claim** (a failed call, a rejected result, a decision request, a timeout): the task's state is recorded on GitHub. The gate then **holds the grant**, so even running a later task by hand makes no call.
- **Before a claim** (a sign-in preflight failure, a failed state fetch, a refused grant check): nothing is recorded and the grant is **not** spent. The gate would technically allow a rerun.

**So the procedure, not the gate, closes both cases.** On any STOP, Chris archives the allowlist (step 6) before anything else, and any rerun needs a fresh direction and approval. The gate is not claimed to enforce an unrecorded failure.

## The launcher (only installed commands)

[`memory-collab-launch.sh`](../../mycelium/collab/memory-collab-launch.sh), sha256 `3ddca150705243ff7ba27d6e199017b4adf56c46745953626bdc8118b2ff0233`. It is 39 lines and installs nothing. It refuses unless it is run as root on fpd-prod with `MYC_BILLING_CONFIRMED=yes` and an allowlist of exactly four lines. For each task in order:

- `completed`: skip;
- `pending`: one `myc-stageb` run, with the same environment pattern as the accepted 27 Oct proof (`MYC_ALLOW` and `MYC_MAX_CALLS` passed through `env -i` to the gate);
- anything else: STOP.

It re-reads the state after each run and stops unless the task is `completed`.

## Offline evidence

[`test-collab-chain.sh`](../../mycelium/collab/test-collab-chain.sh) passes **12/12**. It uses the exact descriptors and launcher, through the real repo `myc-stageb` → `myc-gate` → `myc-agent`, with fake CLIs, a local bare repo, and no network or model:

- the pinned blobs match; all four tasks are pending under the five-field contract with ≤ 2 refs and ≤ 4096 B; the pack is ≤ 32 KB; agents alternate claude/codex;
- **order is enforced by the writer**: running 002 first is refused at claim (its ref is not completed), with no call;
- the full run makes exactly 4 calls in the order claude, codex, claude, codex; all 4 tasks complete and myc-gate publishes all 4 results;
- **each of turns 2–4 receives the previous CLI's answer verbatim**, and every turn receives the pack; a rerun makes no call;
- a Codex failure in turn 2 stops the run after 2 calls. A rerun makes no call, and starting turn 3 by hand is refused (grant held);
- a decision envelope in turn 1 leaves it `awaiting_approval` and stops the run after 1 call;
- without the billing confirmation, or without exactly 4 allowlist lines: refused, no call.

The regression suites are unchanged: runner decisions 29/29, and `shellcheck -S warning` is clean. This is local-fixture evidence, not a host or provider audit.

## Sequence after approval

1. **Cloud Claude creates the four tasks** in one commit: the `task.json` files byte-copied from `proposed-tasks/` (so the blobs match), and `events/0001.json` `{seq:1, status:"pending", actor:"chris", reason:"Created on Chris's explicit approval of BRIX_MEMORY_COLLAB_RUN_PROPOSAL_2026-10-28 …"}`. Chris applies the bundle with `claude-sync.ps1`.
2. **On fpd-prod (Chris), read-only checks first.** The second command makes the gate fetch, and must print `pending seq=1`.
   ```bash
   sudo sha256sum /usr/local/bin/{myc-gate,myc-agent,myc-stageb,myc-decide,mycnotify,hubsync}
   sudo runuser -u hubsync -- env -i HOME=/var/lib/hubsync LANG=C.UTF-8 PATH=/usr/local/bin:/usr/bin:/bin myc-gate state MYC-20261028-001
   sudo runuser -u hubsync -- git -C /var/lib/hubsync/repo show origin/findpitches-v3/greenfield:greenfield/mycelium/collab/memory-collab-launch.sh > ~/memory-collab-launch.sh
   sha256sum ~/memory-collab-launch.sh     # must be 3ddca150705243ff7ba27d6e199017b4adf56c46745953626bdc8118b2ff0233
   systemctl is-active mycnotify.timer     # must be inactive
   ```
3. **The grant: a separate root-owned allowlist.** The original `allowed` file is untouched.
   ```bash
   sudo install -o root -g hubsync -m 0640 /dev/null /etc/myc-stageb/collab-20261028.allowed
   printf '%s\n' \
     'MYC-20261028-001 claude f6f95fba672dfbe3f0da7c57ce5b7c47901991e5' \
     'MYC-20261028-002 codex e085a918658e70703fdbfcf54837f0fbb259cbf0' \
     'MYC-20261028-003 claude c5ed9dc8e5c3210035cb8c3f08d672f8aaa562ac' \
     'MYC-20261028-004 codex 765d5b276be71198e851a103dc87a6aec08846ba' \
     | sudo tee /etc/myc-stageb/collab-20261028.allowed >/dev/null
   sudo runuser -u hubsync -- env -i HOME=/var/lib/hubsync LANG=C.UTF-8 PATH=/usr/local/bin:/usr/bin:/bin \
     MYC_ALLOW=/etc/myc-stageb/collab-20261028.allowed MYC_MAX_CALLS=4 MYC_WINDOW_S=3600 myc-gate grant
   ```
   The grant must show claims 0, max 4, nothing held and a 3600 s window.
4. **Billing check by Chris:** Claude extra usage OFF; no ChatGPT/Codex credits or API key.
5. **Launch, one command:**
   ```bash
   sudo MYC_BILLING_CONFIRMED=yes bash ~/memory-collab-launch.sh 2>&1 | tee ~/memory-collab-20261028.log
   ```
   It ends either with `DONE: all four turns completed` or with a `STOP:` line. On a STOP, do not rerun anything: go straight to step 6 and paste the output.
6. **Close the grant whatever the outcome, and always before any rerun**, then paste steps 5–6 to Claude:
   ```bash
   sudo mkdir -p /root/collab-20261028 && sudo mv /etc/myc-stageb/collab-20261028.allowed /root/collab-20261028/
   ```
7. **Afterwards (cloud, offline; no host or model):**
   1. Claude records the host evidence.
   2. The cloud agents implement turn 4's SQL delta and test scenarios in `greenfield/mycelium/memory/` on PGlite.
   3. One short joint result: what the CLIs improved, open trade-offs, tests run, the minimum next storage step, and a comparison against the preparatory notes.
   4. Codex reviews once.
   5. Stop for Chris before any Neon write.

## Not in this proposal

- no Neon or remote SQL;
- no change to any installed file;
- no unattended runner or timer;
- no live email;
- no resume after a decision;
- no Stage D;
- no further turns beyond these four.

## For Codex (one review) and Chris (one approval)

- [ ] The v6 capability statement and the gaps are accurate (sequential handoff; refs as the only peer channel).
- [ ] The descriptors and pack are acceptable inputs and do not prescribe lanes.
- [ ] The limits, billing safeguards and stop are sufficient; the launcher uses only installed commands.
- [ ] The host sequence is exact.

**Chris:** reply **"approved: BRIX memory collab, 4 calls"** (after Codex's PASS, or now, if you prefer) to authorise exactly the four calls and the host steps above. Nothing runs until then.
