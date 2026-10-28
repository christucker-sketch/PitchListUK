# Shared explorer memory: adapter delivery, offline evidence and exact live plan (Claude, 28 Oct 2026, revision 3)

**Revision 3** answers the [Codex follow-up](SHARED_MEMORY_ADAPTER_REV2_CODEX_REVIEW_2026-10-28.md) of `deef4b6b`. The adapter changes were accepted and are unchanged here. Every trial cleanup is now **ownership-scoped**:

- **R3a, close destroying pre-existing files.** `setup` first creates a root-only receipt directory **exclusively** (`mkdir`, never `-p`). Each artifact is recorded only **after** an exclusive creation: `useradd`, `mkdir`, or an `O_EXCL` file. `close` and `teardown` act **only** on recorded artifacts, and only under a *recognised* receipt: a root-owned 0700 directory, a root-owned regular file and the exact header. With no recognised receipt they change **nothing**. Dangling symlinks count as existing, and nothing is written into an unrecognised receipt directory.
- **R3b, adopting existing directories.** `precheck` and `setup` refuse any of these that already exist: user or group `mycmem`, `/opt/mycelium-memory`, the **whole** `/etc/mycelium`, the verifier path, and the receipt directory. No home directory is created (`--no-create-home --home-dir /nonexistent`). `teardown` removes `/etc/mycelium` only if it recorded creating it **and** it is empty.
- **R3c, the PC close disabling a pre-existing role.** `before` now **refuses** if `mycelium_explorer_fpd` exists. `create` writes a fresh attempt UUID into an exclusively created PC receipt, re-checks the name is absent, and creates the role with **comment `mycelium-explorer-trial <attempt>` in the same transaction**. `disable-login <attempt>` acts **only** on a role carrying that exact comment; a foreign role raises an error and is unchanged. A failed or uncertain create is reconciled read-only (`owned <attempt>` → absent / ours / foreign) before any action.
- **Hard time bounds.** Each step's TERM deadline is `cap − 5 s`, with a 5 s KILL grace, so **every process ends within min(90 s, time left)** and the whole run within **300 s**. This is tested with a child that ignores TERM.

**Revision 2** answered the [Codex review](SHARED_MEMORY_ADAPTER_CODEX_REVIEW_2026-10-28.md) of `2e9adbaa`:

- **R1, fixed:** `render()` now budgets the exact worst-case suffix, so output ≤ `maxBytes` is an invariant on every path. The old code gave 1045 bytes at a 1024-byte cap for Codex's reproduction.
- **R2, fixed:** stances on returned **links** are recalled and rendered, typed `node` or `edge`.
- **R3, done:** the live plan is two reviewed one-shot scripts, with refusals, an overall deadline, close on every path and receipts.
- **Contract corrections:**
  - `maxResults` is now a **total** node budget that includes the starts;
  - only links whose both ends are returned are shown, and the rest are counted in `omittedLinks`;
  - every fixture node and edge is tagged `synthetic`, and the 2 assessments are identified by assessor;
  - section 4 states the CLI tool and network restriction accurately.
- **Spawn errors:** the tests and demo now report `spawnSync` errors such as Codex's EPERM clearly.

Answers the [Codex brief](SHARED_MEMORY_ADAPTER_CLAUDE_BRIEF_2026-10-28.md). **The work is offline only.** No Neon connection, credential, login role, host change or model call was made. The live plan in section 5 is a proposal for Codex's review and Chris's explicit approval.

## 1. What was built (isolated in `greenfield/mycelium/memory/`; no schema migration)

| File | Purpose |
|---|---|
| `src/explorer.mjs` (new) | The adapter: `createExplorerMemory(db, {agent, run})` with `recall`, `search`, `contribute` and `render` |
| `src/memory.mjs` (+1 method) | `appendAll(queries)`: several prepared inserts as **one** transaction, reusing the existing retry and conflict guard and capacity admission |
| `examples/fixtures.mjs`, `examples/shared-memory-demo.mjs` | Deterministic **fake** explorers A and B (no model), and a demo running each as a **separate process** on one persisted local PostgreSQL |
| `test/explorer.test.mjs` | 6 adapter integration tests |
| `scripts/scram-verifier.mjs`, `scripts/explorer-provision.mjs`, `scripts/explorer-live.mjs`, `test/explorer-live.test.mjs` | Tooling for the **proposed** live proof (section 5), with 4 offline tests. Nothing has run against Neon |

`001`–`003` SQL, `runtime_grants.sql`, `schema.mjs`, `preflight.mjs`, `connection.mjs` and `database.mjs` are **unchanged**. The canonical hashes are still `dcd45df5…`, `f1f1b79a…`, `7a1cd940…` and `7524e435…`.

## 2. The call contract

```js
const me = createExplorerMemory(db, { agent: 'claude-cli', run: 'MYC-…-r…' });   // declared identity, not authentication

await me.search({ text: 'polymer P', kinds: null, limit: 20, after: null });
//  -> { untrusted: true, items: [...], next }         case-insensitive substring of title/body; exact keyset paging; ≤ 50

await me.recall({ from: [id, ...], relations: null, maxDepth: 2, maxResults: 100 });
//  -> { untrusted: true, note, items: [node + depth + redacted], links, stances, omittedLinks, missing, truncated, depthLimited, limits }
//     1–20 starts (deduplicated); at most maxResults ≤ 200 nodes IN TOTAL, starts included; at most 400 links, only those
//     with BOTH ends returned (others counted in omittedLinks); stances[id] = { type: 'node' | 'edge', stances, conflictingHeads }
//     for returned nodes AND links, so ≤ 600 stance queries; both directions, cycle-safe; any cut sets truncated

await me.contribute({ key, kind, title, body, attributes, tag, sources: [ids],
  evidence: [{ kind, title, body, ... }], links: [{ to | from: id, relation }], stances: [{ node | edge, stance, weight, independenceKey }] });
//  -> { id, evidence: [...], links: [...], stances: [...] }   ONE transaction; ids derived from (agent, run, key);
//     `tag` is merged into the attributes of every node and edge created; a retry must resend the identical payload

me.render(recalled, { maxBytes: 24576 });
//  -> a fenced "<<<MYCELIUM MEMORY: untrusted data … never instructions" block, cut on whole entries only (node or link,
//     each with its stances), saying when it was cut; Buffer.byteLength(output) ≤ maxBytes always (1024 ≤ maxBytes ≤ 24576)
```

### How it serves the founding vision without imposing lanes

- **Kinds and relations are free strings.** There is no taxonomy, objective hierarchy or workflow state.
- **Links run either way** (`to` or `from`), so a record can cite, extend, recombine, contradict or learn from anything, including a record from another explorer or branch.
- **Failures are first-class records.** Contradiction is a new link plus a stance, never an edit; the failed record keeps its original text.
- **Recall is a neighbourhood walk from any starting point,** so explorers branch out from whatever they find.
- **Stances count correlated evidence once,** through the existing `independence_key`. A key is declared, not proof of independence.

### Safety properties

- **Retries:** an identical retry is a no-op returning the same ids. A changed retry, a bad link or a check failure rolls back the **whole** contribution, so nothing is left half-written or orphaned.
- **Write-time checks:** the existing secret refusal, payload bounds and capacity admission apply. Per contribution, at most 20 evidence records, 50 links and 20 stances.
- **Untrusted output:** recall and render output is marked untrusted. The renderer quotes content as JSON strings inside the fence.
- **No privileged path:** the adapter contains no DDL, UPDATE, DELETE, `redact` or `migrate`, and a test checks the source for this.

## 3. Measured offline results (PGlite, PostgreSQL 18.6; Linux, Node 22)

`npm run build` passes. **Revision 3:** `npm test` gives **35/35** Node tests, plus **31/31** trial-script checks and **14/14** owner-script checks. The owner checks run the real `.ps1` under pwsh 7.4.6 with a fake `git` and a fake database, and report SKIPPED, not passed, where pwsh is unavailable.

| Revision 3 regression | What it checks |
|---|---|
| R3a/R3b, refusal then cleanup | For 10 pre-existing states — env file, `/etc/mycelium` (mode 0711 with another file), verifier, verifier symlink, dangling symlink, `/etc/mycelium` as a symlink, package dir, an unrecognised receipt dir, user, group — **precheck and setup both refuse, then close and teardown exit 0 with every path, mode and byte unchanged** |
| Tampered receipt | A receipt directory with the wrong mode, or a receipt without the exact header, is never acted on |
| Partial setup | npm fails after the user and package were created: close plus teardown restore the exact pre-setup tree, apart from the archived receipt |
| Teardown | Files added later to `/etc/mycelium`, and unrelated `/opt` content, survive |
| Hard caps | A child that ignores TERM is killed within its 6 s test cap, and within a 7 s overall test cap |
| R3c (database) | A pre-existing role and a role from another attempt are refused by `create-login` and `disable-login`, and stay **byte-identical**. A failed create leaves nothing. An uncertain create is proven ours by its comment, then closed |
| R3c (PowerShell) | `before`, `create` and `close` with a foreign role never call a write against it. No effect, an uncertain create, a wrong login and an unreachable database each take the correct path |

**Revision 2:** `npm test` gives **2 + 9 + 8 + 8 + 6 = 33/33** Node tests plus **24/24** shell checks for the trial script (`trial/test-trial.sh`). The previous 19 are unchanged.

| Revision 2 regression | What it checks |
|---|---|
| R1 | Codex's 737-byte reproduction, plus every cap from 1024 to 24576 in steps of 97, with multibyte bodies (€, é, 🍄) and a cut graph. Output is always ≤ cap, every kept entry is complete, and there is no false truncation note. |
| R2 | Under runtime grants, a `contradicts` stance on a `causes` link is returned as `type: 'edge'` and printed beneath that link. |
| Contract | 20 isolated starts with `maxResults: 1` return 1 node, `truncated`. Duplicate starts collapse. Returned links have both ends returned, and `omittedLinks > 0` when cut. All 14 fixture rows are identifiable. |
| Owner side | Close is safe when the role is absent, active or already closed (run twice). `verify-login` refuses any extra membership. The footprint delta is exactly 6/6/2 on top of a pre-existing row. |

The Revision 1 results below still hold.

**The demo (`node examples/shared-memory-demo.mjs`)** ran as two processes (pids 214 and 227) on one data directory:

- **Explorer A** recorded a discovery ("Strain K7 breaks down polymer P at 30 C") and a failed experiment (no activity at 10 C, "activity needs warmth"), each with evidence.
- **Explorer B** knew only the phrase "polymer P". It found A's 2 records by search, and its recall reached **4 of A's records** (both findings and both evidence records). It then recorded a cross-branch result: a marine-branch cofactor gives activity at 10 C. That result is linked `recombines` to A's discovery and `contradicts` to A's failure, with 2 stances. Its rendered prompt block was 1,457 bytes.

**These are fake fixtures, not Claude or Codex CLI collaboration.**

**The new tests cover:**
- durable fresh-process recall and extension, with lineage and declared provenance (`authenticated: false`); A's failure kept unedited but now contested;
- links in both directions and reachability from any end;
- result and depth caps with `truncated`/`depthLimited`, clamped limits, and exact paging over 55 matches;
- identical-retry no-ops, and full rollback on a changed retry, a bad link, an oversize request or a bad stance;
- the adapter working under the **SELECT/INSERT-only runtime grants**, while `redact`, UPDATE, the private capability table and DDL are refused;
- render bounds and fencing;
- **SCRAM-SHA-256 against the RFC 7677 test vector** (client proof and server signature match);
- provisioning (only the verifier is sent and stored; membership `INHERIT TRUE, SET FALSE, ADMIN FALSE`; connection limit 2; rerun refused; rollback);
- the live steps under the explorer login: least-privilege check, A then B, and the **exact footprint of 6 nodes, 6 edges and 2 stances**, with reruns writing nothing; owner-like roles refused;
- the pinned-target guard.

**A bug found and fixed:** a retry that recomputed `sources` from a fresh recall (which then also returned its own earlier write) was refused as a changed payload. It failed safe, but was not a no-op. B's lineage is now A's records in a stable order, and the contract says a retry must resend the identical payload.

**Known limitations:**
- search is a substring scan, not relevance-ranked and not indexed; it is fine at the current scale;
- recall makes one `belief` query per item (≤ 200);
- declared identity is not authentication;
- `independence_key` is self-declared;
- the capacity check reads `pg_database_size` on every contribution.

## 4. What the installed BRIX runner can and cannot do with this

Checked against the source, not assumed:

- `myc-gate` commits **only task event and result files** (`commit_push` refuses anything else).
- A CLI sees **only** its instructions plus up to two refs that already exist in GitHub.
- **CLI tools and network:** Claude Code's tools are **removed** (`--tools ""`). Codex runs `--sandbox read-only` with tools and commands **forbidden by the prompt only**, so that restriction is not enforced. Neither CLI is given a database credential.
- **Credential isolation:** the trial's credential is readable only by the separate `mycmem` user, never by `myc`.

**So no installed path exists for Neon memory to reach a CLI prompt, or for a CLI result to reach Neon.** Any CLI integration needs a bridge, and the bridge needs its own review (section 5, L2). The adapter itself is ready for one: `render()` yields a fenced block small enough for a 32 KB ref.

## 5. Exact live plan (PROPOSAL; nothing below has run)

### L1: one live shared-memory outcome through Neon, database only, no model call

**Outcome.** Two separate processes on fpd-prod, using a least-privilege login that is not the owner:

1. Fixture explorer A records its 2 contributions.
2. Fixture explorer B, in a fresh process, finds them by phrase, recalls them and extends them.
3. A read-only check shows B's record linked to A's.

It proves cross-process shared memory on the real Neon database without any model.

**Exact bounds:**
- **Rows:** 6 nodes, 6 edges and 2 assessments. Every node and edge is tagged `synthetic: true`, and the 2 assessments are identified by assessor `fixture-explorer-b/live-proof-2026-10-28-b`. The fixed run tags are `live-proof-2026-10-28-a/b`.
- **Processes:** 6 fresh ones on fpd-prod (`whoami`, `footprint`, `A`, `B`, `check`, `footprint`). On the PC: `before` (read-only), `create` (create, verify), `close` (disable, verify).
- **Time:** an overall 300 s deadline for the step-4 run, ≤ 90 s per process, and a 15 s timeout on each database request.
- **Retries:** none. Any STOP ends the trial and goes straight to close (steps 5–6). A rerun would need fresh approval.
- **Not involved:** no model call, BRIX task, notifier or timer.

**Least-privilege design:**
- **Login:** one role, `mycelium_explorer_fpd`: LOGIN, connection limit 2, no superuser, createdb, createrole, replication or bypassrls.
- **Grants:** it is granted **only** `mycelium_memory_runtime` `WITH INHERIT TRUE, SET FALSE, ADMIN FALSE`. So it has SELECT/INSERT on graph tables and no UPDATE, DELETE, DDL, redaction or private capability.
- **Self-check:** `whoami` re-checks all of these on Neon and refuses to continue otherwise, including membership of `neondb_owner` or database CREATE.
- **Password:** generated on fpd-prod and **never leaves it**. Only a SCRAM-SHA-256 verifier goes to the PC and then into `CREATE ROLE … PASSWORD '<verifier>'`; PostgreSQL stores it as given.
- **Separate Unix user:** the credential lives in `/etc/mycelium/explorer.env`, root:`mycmem` 0640, for a new system user `mycmem`. The CLI user `myc` cannot read it, which matters because Codex's tool ban is prompt-only.
- **No owner credential:** the migration-owner credential stays on the PC only.

**Exact executable plan (revision 2).** There are two reviewed one-shot scripts, pinned by hash, run by Chris through the established script and sanitised-log route.

| Script | Where | sha256 |
|---|---|---|
| [`trial/mycelium-explorer-trial.sh`](../../mycelium/memory/trial/mycelium-explorer-trial.sh) | fpd-prod | `7fee97712b93e1379d917eb7c23cc3b3b2d55962b276c42b9b52296ec8c5af9c` |
| [`trial/mycelium-explorer-owner.ps1`](../../mycelium/memory/trial/mycelium-explorer-owner.ps1) | PC | `55c91a3bc909c1ab4749b23812d4e6e849e1233b06c04af75d838b1904d40416` |

`<C>` below is the **approved commit**, the commit that publishes this revision, named in Chris's approval record. Both scripts refuse any other commit, and any memory-package difference from it.

| # | Where | Command | What it does / refuses |
|---|---|---|---|
| 0a | PC | `powershell -ExecutionPolicy Bypass -File C:\Users\ChrisT\PitchListUK\greenfield\mycelium\memory\trial\mycelium-explorer-owner.ps1 -Mode before -Commit <C>` | Read-only: records the **actual Neon role and membership options** (`pg_auth_members` admin/inherit/set, grantor, role comments). **STOP if `mycelium_explorer_fpd` already exists, or if an earlier attempt receipt is still open** |
| 0b | fpd-prod | `sudo runuser -u hubsync -- git -C /var/lib/hubsync/repo show <C>:greenfield/mycelium/memory/trial/mycelium-explorer-trial.sh > ~/mycelium-explorer-trial.sh && sha256sum ~/mycelium-explorer-trial.sh` | The hash must equal the one above |
| 0c | fpd-prod | `sudo bash ~/mycelium-explorer-trial.sh precheck` | Read-only. Node ≥ 22.19 and npm present. User **and group** `mycmem`, `/opt/mycelium-memory`, the **whole** `/etc/mycelium`, the verifier path and `/var/lib/mycelium-explorer-trial` all **absent**, symlinks included. Neon endpoint reachable over HTTPS. Otherwise STOP |
| 1 | fpd-prod | `sudo bash ~/mycelium-explorer-trial.sh setup <C>` | Re-checks all of 0c and requires `<C>` to be on `origin/findpitches-v3/greenfield` in the HubSync clone. Then it creates, **each exclusively and each recorded in the root-only receipt only after it succeeds**: the receipt directory; system user and group `mycmem`, with no home; `/opt/mycelium-memory` via `mkdir`, filled by `git archive <C>`; `/etc/mycelium` via `mkdir`; `npm ci --ignore-scripts --omit=dev` (pinned Neon driver only); a 48-hex password from `openssl rand` held only in a temporary file inside the root-only receipt directory; `explorer.env` (O_EXCL) root:mycmem 0640; the SCRAM verifier (O_EXCL) at `/home/ct_admin/mycelium-explorer.scram`, 0600; the temporary password file **shredded**. Never prints the password or the verifier. **No owner credential is ever on fpd-prod** |
| 2 | PC | `scp ct_admin@fpd-prod.Home:mycelium-explorer.scram C:\Users\ChrisT\` | The verifier is sensitive, and it is deleted in step 3 |
| 3 | PC | `… mycelium-explorer-owner.ps1 -Mode create -Commit <C>` | Refuses if a receipt is open or the name exists. Writes a new attempt UUID into an **exclusively created** PC receipt. `create-login` makes the role and its comment `mycelium-explorer-trial <attempt>` in one transaction (flag cleared in `finally`). Then **`verify-login <attempt>`**: ours, LOGIN, unprivileged, limit 2, exactly one membership (runtime, INHERIT TRUE, SET FALSE, ADMIN FALSE). The verifier is deleted in `finally`. **On a failure it reconciles read-only:** absent means nothing was created; ours means it closes and verifies; foreign means STOP with nothing changed; unreachable means STOP, keeping the receipt for a later close |
| 4 | fpd-prod | `sudo bash ~/mycelium-explorer-trial.sh run` | Shreds the fpd-prod verifier copy. Then six fresh processes as `mycmem`: `whoami` (least privilege on Neon), `footprint`, `A`, `B`, `check`, `footprint`. **Hard caps: each process ≤ min(90 s, time left)** (TERM at cap − 5 s, KILL at the cap), **300 s overall**. **STOP at the first failure, with no retry.** It ends `RUN OK` only if the footprint delta is **exactly 6 nodes / 6 edges / 2 assessments** and those are the trial's own rows, so existing rows are preserved |
| 5 | PC | `… mycelium-explorer-owner.ps1 -Mode close -Commit <C>` | **ALWAYS**, whatever happened in steps 1–4. With no receipt it changes nothing. Otherwise `disable-login <attempt>`, which acts only on the role carrying this attempt's comment (a foreign role is never changed), then **`verify-closed <attempt>`**, then the receipt is archived |
| 6 | fpd-prod | `sudo bash ~/mycelium-explorer-trial.sh close` | **ALWAYS**: shreds only the recorded credential and verifier, never a symlink or an unrecorded file. With no recognised receipt it changes nothing. Safe to repeat |
| 7 | fpd-prod | `sudo bash ~/mycelium-explorer-trial.sh teardown` | Optional: removes **only** recorded artifacts: the package dir, the user and group, and `/etc/mycelium` only if empty. It refuses while a recorded credential exists, then archives the receipt and log to `/root` |

**If anything is uncertain:**
- If step 5 cannot verify closure (for example the PC is offline), it prints STOP "do NOT assume closed". Chris then reruns `close`, or disables `mycelium_explorer_fpd` in the Neon Console.
- Step 6 is independent of the network.
- Closure is never claimed without the `verify-closed` receipt.

**Receipts to publish** (Chris pastes the fpd-prod output; Claude reads the PC log `mycelium-explorer-owner.log`):
- the step 0a options;
- the step 3 `VERIFIED` line;
- the step 4 JSON lines and `footprint delta nodes=6 edges=6 assessments=2`;
- the step 5 `VERIFIED … closed`;
- the step 6 `CLOSE OK`.

The 14 synthetic rows remain, because memory is append-only. They are identifiable by `attributes.synthetic` and the fixed run tags. Nothing touches `myc`, `hubsync`, `myc-gate`, timers or the notifier.

**Not requested:**
- any model or CLI call;
- a BRIX task;
- a change to the installed runner;
- an owner credential on fpd-prod;
- an API key or workspace sign-in;
- a Neon config, plan or compute change;
- automatic dispatch.

### L2: CLI ↔ memory bridge (described only; not requested until L1 passes)

Three designs. Each needs its own review:

- **(a) Result → memory, the simplest.** After a completed BRIX task, `mycmem` reads the task's `result.md` from the HubSync clone, which is read-only, and `contribute`s it with provenance `{agent: <CLI>, run: <run_id>, commit}`. There is no runner change.
- **(b) Memory → prompt.** Before a claim, `mycmem` renders a bounded recall into a file, and a reviewed path publishes it as the task's second ref. `myc-gate` cannot commit it today, so this is either a separately reviewed writer or a runner v7 change.
- **(c) A wrapper in place of the CLI.** Rejected: the runner's agent is `claude|codex` only, and changing that is a larger redesign.

L2 needs fresh model-call approval in any case.

## 6. For Codex (one review)

- [ ] The adapter contract is narrow, bounded and free of lanes; `appendAll` is the only change to the existing API.
- [ ] Atomicity, retry and rollback, and the untrusted-data handling are sufficient.
- [ ] The L1 least-privilege design and the SCRAM-verifier credential route are sound. Unix-user separation from `myc` is the right boundary.
- [ ] R3a–R3c and the time bound are fixed as reproduced. Every cleanup is scoped to artifacts this trial provably created (the fpd-prod receipt; the database comment plus PC receipt). The two hashed scripts are exact. L2 is correctly not requested.

## 7. Execution attempt 1 (approved, `c76fd723`): STOPPED at precheck, 28 Oct 2026 16:36Z, with nothing created

Ran under Chris's approval (recorded in `f2f8a02a`/`72f01e64`), stage 1 only (read-only).

| Step | Result |
|---|---|
| 0a PC `before` (16:35:56Z) | Checkout fast-forwarded to `72f01e64`; **memory package identical to `c76fd723`**. **`VERIFIED: mycelium_explorer_fpd does not exist`**, so `BEFORE OK`. The log's secret scan found nothing. |
| 0b fpd-prod script fetch | Taken from the HubSync clone at `c76fd723`; sha256 **`7fee97712b93…af9c`, matching the pin** |
| 0c fpd-prod `precheck` (16:36:29Z) | **`STOP: node >= 22.19.0 is not installed; installing it is a separate approval`** |

**Actual Neon membership options**, read-only, now recorded as remote evidence and not only the local reproduction:

| Role | Member | Grantor | admin | inherit | set |
|---|---|---|---|---|---|
| `mycelium_memory_runtime` | `neondb_owner` | `cloud_admin` | **true** | false | false |
| `mycelium_memory_redactor` | `neondb_owner` | `cloud_admin` | **true** | false | false |

Both roles are NOLOGIN with no elevated flags and no comment. This confirms that the creator-ADMIN membership Codex noted is PostgreSQL's automatic grant: admin only, with no inherit or set, so `neondb_owner` gains no privileges through those roles.

**State:**
- **Nothing was created on fpd-prod,** because precheck is read-only: no user, package, `/etc/mycelium` or receipt.
- **Nothing was created on Neon:** no role and no rows. No PC attempt receipt exists.
- There is nothing to close. `close` and `teardown` would report "no recognised receipt; nothing changed".

**The trial does not continue, as the approval requires.** Providing Node ≥ 22.19 on fpd-prod is a separate host change that needs its own approval; a fresh attempt then follows under the same approved scope. Options are being prepared after a read-only inspection of fpd-prod.

## 8. Node prerequisite (installed), attempt 2 (stopped at create-login; everything closed) and revision 4

### Node 22.23.4 on fpd-prod: INSTALLED 28 Oct 16:51Z

This was approved (`510911df`) with Codex's PASS (`b2564471`); the installer is at `b61d77da`.

- `install-node: download verified: sha256 1805bcd3…e9ce`, extracted to `/opt/node-v22.23.4-linux-x64` (root-owned).
- `INSTALL OK: node v22.23.4, npm 10.9.9`, receipt at `/var/lib/mycelium-node/created`.
- `/usr/local/bin` holds the six Mycelium commands unchanged (sizes and dates as before), plus only the `node`, `npm` and `npx` links.
- Chris did not paste the `check` line or the installer's own hash line. `install` re-runs every collision check itself.

### Attempt 2 at `c76fd723`, 16:52–16:57Z

| Step | Result |
|---|---|
| PC `before` | Package identical to `c76fd723`; `mycelium_explorer_fpd` does not exist; memberships unchanged → `BEFORE OK` |
| fpd-prod script | sha256 `7fee9771…` (matches the pin) |
| fpd-prod `precheck` | node v22.23.4, npm 10.9.9; every trial path absent; Neon endpoint answered HTTPS (400) → `PRECHECK OK` |
| fpd-prod `setup` | Completed (user, package, credential and verifier were all created and later shredded or removed by close/teardown). Its output was not pasted. |
| PC `create` (16:54:40Z) | Attempt `dfa03a10-4bdc-4205-884e-25df5c1ed5f0` recorded → `create-login`: **database error** (text withheld by design) → write flag removed; verifier deleted → read-only reconciliation **`OWNERSHIP: absent`** → "nothing was created" → STOP. Receipt archived as `nothing-created` |
| fpd-prod `close` (16:57:04Z) | Shredded `explorer.env` and the verifier, both recorded → `CLOSE OK` |
| fpd-prod `teardown` | Removed `/opt/mycelium-memory`, the empty `/etc/mycelium` and user/group `mycmem`, all recorded; receipt archived at `/root/mycelium-explorer-trial-receipt-20261028T165704Z.txt` → `TEARDOWN OK` |
| PC `close` (16:57:36Z) | No open receipt; nothing changed |

**Root cause.** The [Neon roles documentation](https://neon.com/docs/manage/roles/) says passwords "must be supplied in plain text" and that "Hashed passwords are not supported". Neon also requires at least 60 bits of entropy. The design sent only a SCRAM verifier. Stock PostgreSQL, and so PGlite, accepts that, which is why every offline test passed; Neon does not. Both reviews missed it.

**Final state, after attempt 2:**
- **Neon:** no explorer role and no rows.
- **fpd-prod:** no trial user, package, credential, receipt or verifier. Only Node, which was approved separately, remains.
- **PC:** no open receipt or verifier.

The safety design worked as intended:
- The failure was contained at the first write.
- Reconciliation proved that nothing was created.
- Every artifact was removed only through its receipt.

### Revision 4: a Neon-compatible credential route (needs Codex's check and a fresh approval)

**What changed** (offline only; schema, migrations and the adapter are untouched):
- **Password generation, fpd-prod `setup`:** a 40-character URL-safe password (240 random bits; upper case, lower case and digit; no character three times running), so it clears Neon's 60-bit minimum with a wide margin.
- **One-time PC copy:** setup writes the plain-text password to `/home/ct_admin/mycelium-explorer.pw` (O_EXCL, 0600, recorded) **in place of the verifier**. It needs no quoting or URL-encoding.
- **PC `create`:**
  1. Reads that copy after `scp`, and refuses anything not of that exact shape, including a hash.
  2. Sends the password over TLS in `CREATE ROLE … PASSWORD '<plain>'`, as Neon requires; Neon hashes it on storage.
  3. **Overwrites, then deletes,** the PC copy in every outcome.
- **fpd-prod copy:** `run` shreds it, as does `close`.
- **Diagnosable errors:** a failure now reports its SQLSTATE and server message, with the password, any URL and any long token-like string removed.
- **Removed:** `scripts/scram-verifier.mjs` and its RFC test, since they are no longer used.

**Trade-off, stated plainly.** The password now leaves fpd-prod once, over Chris's own SSH, to the PC that already holds the far more powerful owner credential. It is wiped there straight away. Neon's documented path requires the plain text to reach the server over TLS. It never appears in chat, the hub, logs or receipts; the tests check this.

**Tests:** 35/35 Node tests, 30/30 trial checks and 15/15 owner checks. The owner checks run under pwsh 7.4.6 and include a hash-shaped copy being refused before any write and still being wiped.

**New pins:**

| Script | sha256 |
|---|---|
| fpd-prod `trial/mycelium-explorer-trial.sh` | `fb8e3805e173de235ea8287d59dc7ea5dbac22c2b77f69f884d163bcc8569a3d` |
| PC `trial/mycelium-explorer-owner.ps1` | `0aca3b6519a0e27bf066d05404a0df0429489acbf0b31b62a5cb14e5b518d9b4` |

The approved commit becomes the commit that publishes this revision. The steps are the same as section 5, except that step 2 is `scp ct_admin@fpd-prod.Home:mycelium-explorer.pw C:\Users\ChrisT\` and the PC `create` wipes that file. Limits, bounds and closure are unchanged.

## 9. Attempt 3 at `7a49e578`: login proven on Neon; stopped at `footprint` on the connection limit; all closed; revision 5

**Read-only pre-check, from the PC as owner.** `mycelium-runtime-check.mjs` gave **16/16 PASS**. The runtime role the login inherits has exactly what `whoami` requires:
- CONNECT, schema USAGE, and INSERT/SELECT on the graph;
- no database or schema CREATE, no UPDATE or DELETE, no capability table and no `redact`;
- `password_encryption=scram-sha-256`, and `createrole_self_grant` empty.

**Execution:**

| Step | Result |
|---|---|
| fpd-prod script | sha256 `fb8e3805…` (matches the pin); `precheck` OK (17:21:34Z) |
| fpd-prod `setup` (17:22:49Z) | `SETUP OK`: user/group `mycmem`, package `@7a49e578`, credential 0640, one-time PC copy 0600 |
| PC gate (Codex's wrapper) | `before` OK; scp; `create`: **`Created mycelium_explorer_fpd for attempt aef3d63f-2a5f-455f-8de2-0343160ea1e7`**, then `VERIFIED: … approved least-privilege state`; the PC copy was overwritten and deleted; **`PC password copy absent: True`**; **READY** (17:23:20Z) |
| fpd-prod `run` (17:25:01Z) | Shredded the fpd-prod PC copy. **`whoami` PASSED on Neon** as `mycelium_explorer_fpd`: elevated=false, can_append=true, can_mutate=false, can_see_capability=false, can_redact=false, can_create_schema=false, owner_member=false. **`footprint` failed**, with the error text still hidden by `explorer-live.mjs` (a gap). STOP; nothing retried; **A and B never ran** |
| fpd-prod `close` and `teardown` (17:25:30Z) | Shredded the credential; removed the package, `/etc/mycelium` and `mycmem`; receipt archived at `/root/mycelium-explorer-trial-receipt-20261028T172530Z.txt` |
| PC `close` (17:25:38Z) | `disable-login` for attempt `aef3d63f`, then **`VERIFIED: … closed (NOLOGIN, no membership)`**; receipt archived |

**Root cause, measured read-only at 17:27:43Z.** `pg_stat_activity` showed **2 idle sessions** for `mycelium_explorer_fpd`, both opened at 17:25:01.9Z by the single one-query `whoami` process. Neon's HTTP proxy keeps server connections open for reuse, so the `CONNECTION LIMIT 2` was full, and the next process's first query could not connect. The same check confirmed `rolcanlogin=false` and that memory is untouched (2 nodes, 1 edge, 0 assessments, 0 trial rows).

**Final state:**
- `mycelium_explorer_fpd` remains on Neon, NOLOGIN with its membership revoked, as the design intends.
- No credential remains anywhere, and no rows were written.
- On fpd-prod only Node remains.
- The two idle pooled sessions expire with the proxy or compute idle timeout; the password itself is shredded everywhere.

**Revision 5 (offline; schema, migrations and the adapter untouched):**
- **Connection limit 2 → 20**, about a fifth of the Free compute's capacity, with room for the proxy's held sessions. A read-only reuse probe (`mycelium-pool-probe.mjs`) is being run to confirm that 20 suffices.
- **A fresh login name, `mycelium_explorer_fpd_r5`.** The closed attempt-3 login is neither reused nor dropped, so there is no destructive Neon step.
- **`explorer-live.mjs` errors now report the SQLSTATE and the server message,** with the password, any URL and any long token removed, using the same `describeError` as provisioning.
- **Tests:** 36/36 Node tests, 30/30 trial checks and 15/15 owner checks.
- **New pins:** fpd-prod `3459deed44e4042e6d7269d439e64a8726446a1ee1d5686aa7270e2c0a015748`; PC `04513c592d23b30c4576ce25289fb92f4dd8906022a447ad93b15d2cc1dd2bf2`.

## 10. Attempt 4 at `22637731` (revision 5, approved directly by Chris): **RUN OK: shared memory proven live on Neon**, then fully closed

**Approval.** Chris approved revision 5 directly ("no more codex checking for now, get it working and then report back"), after seeing the attempt-3 diagnosis. Codex reviews these real results afterwards.

**Reuse probe** (read-only, owner, 17:31Z). 20 sequential HTTP requests added **1** server session (from 1 to 2): `POOL REUSES`. That confirms connection limit 20 is ample for six sequential processes.

### Execution

| Step | Result |
|---|---|
| fpd-prod script | sha256 `3459deed…5748` (matches the pin); `precheck` OK (17:33:36Z) |
| fpd-prod `setup` | `SETUP OK`: package `@22637731e489`, credential 0640, one-time PC copy 0600 |
| PC runtime check | `RUNTIME CHECK OK` (16/16; `mycelium_explorer_fpd_r5` free) |
| PC gate, first run (17:33:53Z) | **Refused safely**: the gate file on the PC still pinned `7a49e578`, because the file transfer had resent a cached copy. Its `before` step reported "memory package differs from approved" and stopped with no transfer. The file was then corrected in place and verified (pin `22637731`, 2703 bytes) |
| PC gate, second run (17:35Z) | `before` OK; then **`Created mycelium_explorer_fpd_r5 for attempt 11f49f29-5670-40ed-b35b-313ae2eabc92: LOGIN, connection limit 20, inherits mycelium_memory_runtime only`**; then `VERIFIED … approved least-privilege state`; the PC copy was overwritten and deleted (**absent: True**); then **READY** |
| fpd-prod `run` (17:36:07Z), **RUN OK in 4 s** | See the six process results below |
| fpd-prod `close` and `teardown` (17:36:11Z) | Shredded the credential; removed the package, `/etc/mycelium` and `mycmem`; receipt archived at `/root/mycelium-explorer-trial-receipt-20261028T173611Z.txt` |
| PC `close` (17:36:18Z) | `disable-login` for attempt `11f49f29`, then **`VERIFIED: … closed (NOLOGIN, no membership)`**; receipt archived |

**The six fresh processes,** all as `mycelium_explorer_fpd_r5` on `neondb`:

1. **`whoami`** (pid 183695): elevated=false, can_append=true, can_mutate=false, can_see_capability=false, can_redact=false, can_create_schema=false, owner_member=false.
2. **`footprint`, before** (pid 183711): 2 nodes, 1 edge, 0 assessments. These are the earlier smoke rows; there were no trial rows.
3. **`A`** (pid 183728): recorded discovery `6a2f791e-f845-8f0c-801b-7ea2f5ee8776` and failed experiment `40733259-1c92-872f-9b7e-c6e242f2cb3c`, each with evidence.
4. **`B`** (pid 183744, a fresh process that knew only the phrase "polymer P"):
   - searched and found 2 records, then **recalled all 4 of A's records** (both findings and both measurements);
   - recorded cross-branch result `08874091-5434-8418-aea8-6684084a90bb` with 3 links and 2 stances;
   - its rendered prompt block was 1,509 bytes.
5. **`check`** (pid 183761, read-only recall from B's record): reached all 6 trial nodes, with A's declared as run `live-proof-2026-10-28-a` and B's as `…-b`. Links: `contradicts`, `evidenced_by` ×3, `recombines`, `tests_limit_of`. Stances: A's discovery is **supported** (0.6); A's failed experiment is **contradicted** (0.7). The failure is kept and contested, not erased.
6. **`footprint`, after** (pid 183777): 8 nodes, 7 edges, 2 assessments.

**`footprint delta nodes=6 edges=6 assessments=2; trial rows 6/6/2`**: the existing rows were preserved.

### Final state

- **Neon:**
  - **14 synthetic rows** are kept, identifiable by `attributes.synthetic` and the run tags, as designed.
  - `mycelium_explorer_fpd_r5` and the attempt-3 `mycelium_explorer_fpd` are both NOLOGIN with their membership revoked.
  - No schema or grant changed.
- **fpd-prod:** no trial user, package, credential or password copy. Node 22.23.4 remains, approved separately.
- **PC:** no password copy and no open receipt. The logs scan clean of connection strings.
- **Model calls:** zero AI calls throughout.

**What this proves.** Two separate explorer processes on fpd-prod shared memory through the live Neon database:
- each used a least-privilege login, never the owner;
- the second found the first's work knowing only a phrase, built on it in a new direction, and contested one of its findings;
- everything was append-only and bounded, and closed afterwards with receipts.

**What it does not yet do.** Connect the BRIX Claude and Codex CLIs to this memory (the L2 bridge, section 5). That remains a separate decision.

## 11. L2 bridge: the real BRIX CLIs read and extend Mycelium memory (Chris approved: "Send it", 28 Oct)

The installed runner is unchanged. Memory reaches the CLIs as a task ref, and their answers return to memory through the append-only adapter. No human edits or relays any content.

1. **Snapshot** (PC, owner, **read-only** on Neon). `mycelium-bridge.ps1 -Mode snapshot` runs `scripts/bridge.mjs snapshot`. It searches memory for "polymer P", recalls the neighbourhood and renders it as a fenced untrusted-data block (≤ 24 KB) at `greenfield/mycelium/collab/memory-recall-2026-10-28.md`. It then commits and pushes **only that file**; it refuses local changes and never overwrites.
2. **Two CLI turns** (fpd-prod, the installed runner). `collab/bridge-launch.sh` (sha256 `31a6d72a…64a3`) is the reviewed four-turn launcher reduced to two turns: allowlist `/etc/myc-stageb/bridge-20261028.allowed`, `MAX_CALLS=2`, a 1800 s window, stop on any non-completed turn.
   - **`MYC-20261028-005`, Claude Code** (descriptor `1edf40f3f81f523171c6d5bc5b6dec3451709efe`): refs the snapshot. It proposes one contribution that takes the memory somewhere new.
   - **`MYC-20261028-006`, Codex** (descriptor `f22d5ae81aebea61b11a6e8fc70e6bd2f1578d7e`): refs the snapshot and 005's unedited result. It responds to Claude, then proposes its own contribution, which may link to Claude's as `@MYC-20261028-005`.
   - Each answer ends in one `mycelium-contribution` JSON block: kind, title, body, 1–4 links, and 0–3 stances.
3. **Ingest** (PC, owner, **append-only**). `mycelium-bridge.ps1 -Mode ingest` runs `bridge.mjs ingest`.
   - **Validation:** strict. There must be exactly one block; ids must come from the snapshot, or be `@005`; fields are bounded.
   - **Recorded as:** agent `claude-cli` or `codex-cli`, run = the BRIX run id, key = the task id. A re-ingest is a no-op, and a changed answer is refused with nothing written.
   - **Tags:** `bridge: l2-proof-2026-10-28` and `model_written: true`.
   - It then verifies with a read-only recall.

**Bounds:**
- **Model calls:** 2 (1 Claude, 1 Codex), subscription only after Chris's billing check.
- **Writes:** at most 2 contributions, ≤ 8 links and ≤ 6 stances, plus the 1 snapshot file in Git.
- **Unchanged:** no runner change, no schema change, no new login, no service.
- **Afterwards:** the allowlist is archived.

**Offline evidence:**
- `test/bridge.test.mjs` passes 4/4: snapshot ref rules; ingest with a cross-CLI link; no-op re-ingest; refusal of a changed answer; strict parsing; atomic per-answer writes.
- `collab/test-bridge-chain.sh` passes **7/7**. It runs the exact tasks and launcher through the real runner with fake CLIs, and confirms:
  - Claude's prompt carries the memory;
  - Codex's prompt carries the memory and Claude's answer;
  - a rerun makes no call;
  - the real ingest links Codex's contribution `refines` → Claude's.
- **Full suite:** 40 Node tests, 30 trial checks and 15 owner checks. The SQL is unchanged.

### L2 bridge, executed 28 Oct 2026 (17:51–17:54Z PC; ~18:00Z fpd-prod): **BRIDGE OK**

| Step | Result |
|---|---|
| PC `snapshot` (17:51:56Z) | Read-only: **6 nodes, 2637 bytes**. Pushed as `ec840c76` (only that file) |
| fpd-prod launcher | sha256 `31a6d72a…64a3` (matches); allowlist of 2 lines; grant claims 0/2 |
| `MYC-20261028-005`, Claude Code | Claim `aa373b18` → **1 call, 18 s** → completed `434f8fd3`, result sha256 `1a205ef0…7001` |
| `MYC-20261028-006`, Codex | Claim `e67b2a05` → **1 call, 17 s** → completed `2c218335`, result sha256 `d87456c5…3227` |
| fpd-prod close | Allowlist archived to `/root/bridge-20261028/`; grant 2/2 consumed |
| PC `ingest` (17:54:20Z) | **`INGESTED MYC-20261028-005 (claude-cli) as 462e08a4-4701-801c-8bd2-68c38b01a73e`** with 4 links and 1 stance. **`INGESTED MYC-20261028-006 (codex-cli) as 7362c4bb-749c-8faa-9db9-734758c2da10`** with 3 links, including **`refines_proposed_factorial_interpretation → 462e08a4…` (Claude's contribution)**. Then `VERIFY`: recall reaches 6 nodes and 7 links, 0 missing → **BRIDGE OK**; write flag removed; the log scans clean |

**What the CLIs did with the memory** (their unedited answers are in `tasks/MYC-20261028-00{5,6}/result.md`):

- **Claude Code** read the recalled graph, including the earlier explorer B's "cofactor M overturns the 10 C failure" result. It **challenged** that result:
  - Plate 9 has no sterile+M control, so the 9% loss could be abiotic.
  - The "contradiction" is really a difference of scope.

  It proposed a K7 × M × temperature factorial probe. In memory, its contribution is linked to four earlier records, with relations it chose: `identifies_missing_control_in`, `challenges_causal_claim_of`, `narrows_scope_of` and `proposes_factorial_extension_of`. It also holds a **neutral** stance (0.4) on the cross-branch claim.
- **Codex** read the same memory **and Claude's answer**. It agreed and then **corrected Claude twice**:
  - "K7 alone is inactive at 10 C" overstates the evidence.
  - An abiotic 9% would not exclude a biological effect.

  It contributed an explicit interaction-contrast criterion, I = [L(K7+M) − L(K7)] − [L(sterile+M) − L(sterile)]. In memory, its contribution is linked **`refines_proposed_factorial_interpretation` → Claude's contribution**, plus two earlier records.

**Proven:**
- The installed CLIs read shared memory **from the live Neon database**, through a read-only snapshot used as their task reference.
- They extended it in directions nobody prescribed: a challenge, then a refinement of that challenge.
- Their validated contributions were written back, append-only, linked to the prior graph **and to each other**, with declared provenance (agent `claude-cli`/`codex-cli`, the BRIX run ids, the task keys).
- **No human edited or relayed content.**

**Totals:**
- 2 model calls.
- Memory gained 2 contribution nodes, 7 edges and 1 assessment, tagged `bridge: l2-proof-2026-10-28` and `model_written: true`.
- No schema, runner, login or service change.

**Known limits:**
- The turns are still fixed and sequential (the runner's design).
- The snapshot and ingest steps run from Chris's PC under the owner credential.
- The ids the CLIs cite are validated against the snapshot, but their scientific claims are the models' reasoning about **synthetic fixture data**, not facts.
