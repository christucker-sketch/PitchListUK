# Codex — shared-memory database trial ready for approval, 28 October 2026

**PASS for the concrete bounded trial proposal. No live execution is authorized yet.** Reviewed Claude revision3 `aab98936` and published a test-only portability fix in **`c76fd723f76ebbc2f9564eb927db7b23774f8286`**. Use that full commit as `<C>` in the [exact plan/commands](SHARED_MEMORY_ADAPTER_DELIVERY_2026-10-28.md), section5. Its executable scripts are identical to Claude's reviewed revision3.

## Findings closed

- Adapter renderer/edge-assessment/total retrieval-budget findings were accepted in the prior review; src and migration SQL are unchanged by revision3.
- R3a/R3b: setup refuses existing users/groups/config/package/verifier/receipt paths including symlinks, creates no home directory, and exclusively creates a root-only receipt. Close/teardown act only on recognized, recorded creations; no receipt means no deletion. The former precheck-refusal cleanup paths preserve pre-existing bytes/modes/paths.
- R3c: read-only baseline refuses an existing role; creation and unique attempt comment commit together. A failed/uncertain create is reconciled read-only. Close changes only the role with that attempt's exact comment; foreign roles refuse unchanged.
- Timeout TERM grace is reserved inside90s/process and300s run caps, including a TERM-ignoring child fixture.
- Existing memory setup/schema, migration owner credential, CLI user/runner, services/timers and Neon Auth remain outside the trial's mutation scope.

## Independent validation and limits

Build PASS. **8 focused provisioning/role/footprint tests PASS**. **31 shell trial checks PASS** using fake users/npm/steps and a temporary local Git/root fixture; no network or live credentials. Collision/refusal/close/teardown, partial setup, foreign roles, timeouts and secret-output checks cover the reproduced findings.

The original shell snapshot test initially failed because directory allocation size changed after the intentional receipt archive was created. In c76fd723, the snapshot compares directory paths/modes, regular-file sizes/content and symlink targets instead of filesystem-dependent directory st_size. All31 then pass. This changes a test only, not executables or behavior.

PowerShell is not installed here: its14 executable fake-control-flow checks were reported by Claude under pwsh7.4.6 and independently source-reviewed, not rerun by Codex. Previous unchanged adapter/base test evidence is retained; the existing executor child-spawnEPERM limitation prevents claiming a new full35-test independent run. Actual Neon SCRAM login/host execution remains precisely what the proposed live trial will test.

Verified executable SHA256:
- host `mycelium-explorer-trial.sh`: `7fee97712b93e1379d917eb7c23cc3b3b2d55962b276c42b9b52296ec8c5af9c`
- PC `mycelium-explorer-owner.ps1`: `55c91a3bc909c1ab4749b23812d4e6e849e1233b06c04af75d838b1904d40416`

## Exact approval proposed

Approve the section5 L1 sequence at commit **c76fd723f76ebbc2f9564eb927db7b23774f8286**:
1. Read-only PC role/membership/absence precheck and host prerequisites/collision checks. Missing Node>=22.19 or any collision is a STOP, not permission to install/replace infrastructure.
2. On fpd-prod, create isolated system user/group mycmem (no home), root-owned /opt/mycelium-memory package/dependencies, new /etc/mycelium credential directory, protected receipt and verifier. No owner credential leaves the PC.
3. Via the existing Windows owner environment, create exactly one temporary login mycelium_explorer_fpd bound to the recorded attempt; inherit only runtime, SET/ADMIN false, connection limit2; verify exact membership options.
4. Six fresh database-only processes on fpd-prod (whoami, footprint, A, B, check, footprint), <=90s each/300s total. Exactly **6 synthetic nodes +6 edges +2 assessments**, preserving existing records. No model/CLI calls.
5. Mandatory owner close: NOLOGIN/revoke runtime membership for this attempt only, read-only verify and archive receipt. Mandatory host close: remove this trial's recorded credential/verifier. Include optional teardown of only recorded host artifacts if Chris chooses it; no unrecorded/pre-existing data removal. Synthetic database rows remain, disabled role remains.
6. Any refusal/failure stops subsequent work; no retry or second trial. Perform scoped closure/reconciliation and publish receipts. Never claim closed when verification failed; follow the documented owner-side recovery. No new service/timer, runner integration, paid resource, Neon config change, real redaction or automatic dispatch.

Approval phrase: **“approved: bounded BRIX shared-memory database trial”**. This covers the reviewed temporary host/login/database steps and scoped closure, not the future CLI-memory bridge or new AI/model usage. Until that owner response, no trial command/credential/host change is executed. After approval Claude coordinates the existing script/Chris-command/sanitized-log route; Codex reviews actual receipts once.
