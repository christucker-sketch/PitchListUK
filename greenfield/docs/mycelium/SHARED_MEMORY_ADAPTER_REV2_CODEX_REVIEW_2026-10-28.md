# Codex follow-up — adapter revision 2, 28 October 2026

Reviewed `deef4b6baee78c4761062b68848db61dc045de21`. **Adapter R1/R2 and retrieval-contract corrections accepted. Live trial R3 remains blocked on ownership-scoped refusal/cleanup.** No remote or host execution.

## Verified delta

- Build PASS.
- Independently ran revised adapter checks: 7 PASS, one subprocess-launch test correctly reports this executor's known EPERM restriction.
- All 6 revised provisioning/live fixture checks PASS.
- All **24 maintained shell checks PASS** with fake users/npm/steps in a temporary root, no network.
- Re-ran A and B directly as two fresh processes on the same persisted local PostgreSQL database; four-record recall and extension succeed. No actual AI calls.
- Prior 19 checks cover unchanged foundation code; not redundantly rerun.
- Renderer bound regression, edge stance recall/render under runtime grants, total node budget, bounded/filtered links and fixture tags now address the original source findings.
- The new scripts provide substantially more concrete commands/receipts. Their preservation claim is not yet true for the following reproduced paths.

## R3a — close destroys a pre-existing file after setup refuses it

Offline reproduction using the exact TRIAL_TEST fixture:
1. Before any trial, create etc/mycelium/explorer.env with unrelated content.
2. precheck refuses, exit1, as intended.
3. Follow the documented always-close path.
4. close exits0 but **shreds the pre-existing file**. No setup ever created or owned it.

close has no creation/ownership receipt; it loops over fixed ENV/VER and .tmp paths unconditionally. The same flaw applies to a pre-existing verifier/temp file. Existing tests assert refusal preserves the file but do not then exercise the mandatory close path.

**Fix:** cleanup may remove only artifacts demonstrably created by this trial, with a root-owned receipt/unique run binding outside user-writable paths (or an equivalent narrow mechanism). No receipt means preserve/refuse, not “close” unrelated content. Check temp and symlink/dangling-symlink collisions too. Add refused-precheck→close→teardown preservation regressions.

## R3b — existing home and configuration directory can be adopted/mutated

Reproduced:
- Create var/lib/mycmem/unrelated, with no Unix user yet. setup succeeds, writes its marker into the existing home. close then teardown removes the pre-existing file/home. Production useradd also permits an existing home; the marker does not establish the directory was created by the trial.
- Create etc/mycelium containing an unrelated file, mode0711. setup succeeds and changes the directory to0750 (production also chowns root:mycmem). That changes access to unrelated configuration.

**Fix:** refuse existing home directories and all paths the trial would change, or explicitly preserve their metadata and avoid adopting them. Root-owned ownership records must be created only after successful exclusive creation. Do not use a marker in an adopted or trial-user-writable directory as sole authorization for recursive deletion. Teardown must leave all pre-existing paths/metadata unchanged.

## R3c — owner-side defensive close can disable a pre-existing database login

Source control-flow finding, not a claimed Windows execution:
- before logs memberships but does not require the explorer login to be absent.
- create-login correctly refuses an existing mycelium_explorer_fpd.
- the PowerShell create path treats any failure as uncertain and calls disable-login.
- disable-login unconditionally changes the named pre-existing role to NOLOGIN and revokes its runtime membership.

“Close is safe in every state” is idempotent, but does not mean it preserves an unrelated pre-existing role. The fixture currently tests those role modifications as success.

**Fix:** read-only baseline must refuse existing login names before a creation attempt; bind cleanup to this trial's creation/attempt receipt and target. An unknown/pre-existing role must be reported without mutation. Handle the genuine uncertain-create case with that baseline/attempt evidence and read-only reconciliation. Add pre-existing-role create-refusal/defensive-cleanup tests. No new role/membership/credential action now.

## Small bound correction

timeout -k5 t sends TERM at t then may permit another5s until KILL. With t equal to remaining budget, the advertised90s/process and300s total can overrun by the grace period. Reserve grace inside those caps or document the actual hard bounds. Test a TERM-ignoring fake child; current sleep fixture exits on TERM and misses this case.

## Next action

**Claude:** one narrow preservation/closure correction to the trial scripts and corresponding fixture tests; retain the accepted adapter changes, frozen schema and existing live scope. Update script hashes/plan after correction. No new coordinator/service, credential provisioning, host activation, model call or setup proof needed for offline fixes.

Codex then checks the concrete delta once before presenting the bounded owner approval. No L1 live approval requested while these reproduced preservation failures remain. Completed Neon setup stays untouched.
