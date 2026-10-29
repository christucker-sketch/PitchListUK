# Stage One final Codex engineering sign-off — 29 October 2026

**PASS for the reviewed installation/setup candidate at `d2d28c06547dcd137b398f0155df46b86b4137a8`.** No remaining blocking engineering finding for this bounded Stage One proposal.

The revision2a diff closes the last R1 omission path: expiry validation (missing/malformed) is inside expected-copy cleanup; unexpected files remain untouched. Added owner regressions cover missing/malformed expiry and rotate omission. PowerShell command-line rejection before the script starts is accurately documented as requiring manual copy removal. Verified the final owner script SHA-256 matches the proposal: `9e1122de6243db3bd117d6e13a1ba40148fae587134ec245c19152ee9ecc871d`.

R2–R5 were reviewed and accepted in [the revision2 assessment](STAGE_ONE_REV2_CODEX_REVIEW_2026-10-29.md). Their implementation is unchanged in revision2a. Independent evidence remains StageOne10/10 and host43/43 PASS, explorer7/8 with the child-process harness blocked by workspace EPERM, plus separately executed A/B persistence/reuse PASS. Prior independent memref15/15 and upgrade9/9 remain applicable. Owner **25/25 is Claude-reported under pwsh7.4.6**; no PowerShell runtime is available here. Final cleanup correction was source-reviewed and hash-verified, not independently executed on Windows. No claim of a live Neon or host audit.

## Concrete next action

**Next actor Chris:** approve or decline **installation/setup scope 1** in [proposal §5](STAGE_ONE_FINAL_PROPOSAL_2026-10-29.md), pinned to the full commit above. A concise approval would be:

`approved: Stage One install at d2d28c06547dcd137b398f0155df46b86b4137a8`

That scope includes:
- checked myc-gate local-memref upgrade, with existing byte-verified rollback;
- receipt-scoped persistent mycmem/package/config/snapshot store on fpd-prod;
- one new runtime-only bridge login, connection limit20, password expiry no later than2026-12-31T23:59:59Z, existing Windows owner provisioning/private-copy gate;
- Unix/effective-privilege checks and prepare of stage-one-proof-1: **one seed question node**, then read-only snapshot;
- scope-specific rollback/close on failure, preserving unrelated services and existing data.

The approval must explicitly encompass the proposal's two limits: **one combined database identity** (recall is READ ONLY but its credential can append) and **BRIX-only snapshot/recovery artifacts** (host loss may strand the batch). These are bounded-proof exceptions, not claims of production durability or authority for StageTwo.

After that owner approval, **Claude** coordinates the existing Chris-command/sanitized-log execution route. No further architecture or test-proof replay is needed. If Neon rejects the expiry or privilege preflight fails, STOP and reconcile/close within the approved scope; no silent fallback or expansion.

**Scope2 remains separate:** once snapshot bytes exist, publish/review the digest-pinned two task descriptors at commitY; Chris then approves the exact two-call/30minute proof, linked ingestion, fresh verification and bounded database-only recovery. This sign-off does not authorise those calls or StageTwo.

No host configuration, role creation, credentials, Neon writes or live model calls were performed by Codex during review. Engineering sign-off is not owner deployment approval.
