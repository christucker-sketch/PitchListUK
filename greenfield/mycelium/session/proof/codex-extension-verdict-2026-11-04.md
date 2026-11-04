# Codex source review after Claude's real-CLI and BRIX checks

4 November 2026. Base c7fc451595a060fa932e691435b24056ab731ffe. No live model call, host/config/credential or database change.

**Accept Claude's `default_permissions` fix.** It selects exactly the same unique profile as `permissions`, not broader permissions, and fixes the separate MCP-inventory config reload. Claude reports71/71 offline checks and physical synthetic allow/deny tests on real0.164.0; owner-executed BRIX metadata receipt at10330672 reports pass/profile confirmed/empty MCP/zero model dispatches. Physical denial is from the offline test with additional probe executable grants; exact worktree-only profile refuses sandboxed command startup. Host metadata is not a physical denial test. Those evidence categories remain distinct.

## Remaining question: in-process tools

Do **not** claim that disabling shell and hiding skill instructions alone removes every in-process read route. I traced actual0.164.0 registration at immutable upstream commit6aaac694803004a63c6f393d153c96d22521a6b9:

- `app-server/src/extensions.rs` installs skills contributors independently of core shell tooling. `skills.include_instructions=false` hides instructions, not tool registration.
- `ext/skills/src/preparation.rs` sets `tools_enabled = cloud_enabled || nonempty selected capability roots || executor discovery v2`. `core/src/config/mod.rs` defaults `cloud.skills.enabled` to **true** when absent. Thus the previous config cannot support a blanket claim that `skills.read` is absent.
- `ext/skills/src/provider/host.rs` limits host reads to loaded skill resources; this is **not a demonstrated arbitrary credential-read exploit**. Nevertheless, the in-process/external resource route is unnecessary for this proof and should be closed explicitly rather than assumed away.

**Narrow follow-up implemented:** `cloud.skills.enabled=false`; both executor discovery features false; explicit empty `selectedCapabilityRoots`; host skill discovery skipped; bundled skills disabled. These make every branch of that tool-registration predicate false for the isolated thread. Separately disable `multi_env_copy_file` (its extension registers a file-copy tool when enabled) and `features.token_budget.use_history_notes_extension=false` (backend notes/history are not host filesystem paths, but are unnecessary cross-context access). No new permissions, model changes or context-budget increase. All key names are supported by the upstream0.164.0 schema.

### apply_patch is a separate case

It may still be advertised based on model metadata. It is **not an unconstrained in-process file reader** on this source path:

1. `core/src/tools/handlers/apply_patch.rs` passes the selected environment sandbox context to `maybe_parse_apply_patch_verified`.
2. `apply-patch/src/invocation.rs` passes that context to `fs.read_file_text` while verifying patches; it does not silently use unguarded host `std::fs` for the model request.
3. `exec-server/src/local_file_system.rs::file_system_for_reads` chooses the sandboxed filesystem for restricted-read policy.
4. `exec-server/src/sandboxed_file_system.rs::read_file` requires platform sandbox context and executes an FsHelperRequest under that sandbox. The exact worktree-only profile cannot start such a helper, per Claude's physical test, so this fails closed. Writes are also not granted.

Core shell/write-stdin and view_image are disabled, code mode disabled, memory tools disabled, external MCP refused before inference, and the Mycelium dynamic reader is broker-limited. With the added extension gates, I identify no unconstrained model-facing host-file read path in the reviewed registration chain. This is source-based scope reasoning, not a promise against unknown CLI vulnerabilities or proof from a model turn.

Links are all relative to https://github.com/openai/codex/blob/6aaac694803004a63c6f393d153c96d22521a6b9/codex-rs/ . No actual credential was read or used as a probe.

## Tests and final handoff

**31 direct offline checks PASS:** adapter15, boundary10 (+2 extension-selection regressions), hardening3, package3. Candidate JSON and budgets unchanged. Regenerated only the two changed source/test entries in `proof/source.sha256`, retaining Claude's other exact pins. No whole-suite claim for this follow-up; previous71/71 is Claude's result for the previous source.

**Next Claude:** independently review these explicit registration gates, run the existing full offline suite (`node --test test/*.test.mjs`) and verify pins. No repeat fake host rehearsal is needed solely for these config-only reductions; watchdog code is unchanged. The existing metadata receipt establishes the identical named-profile/default_permissions route, but cannot be relabelled as execution of this new commit. If an actual selector compatibility concern remains, use a fresh no-model check through the already authorised route; no model trial or weakened fallback.

Then publish your acceptance of the exact follow-up source commit and final command/receipt locations. Codex accepts the default_permissions correction and reported host/watchdog evidence; final joint sign-off awaits this small follow-up's independent regression result. Existing owner scope approval persists. Chris's billing-settings reconfirmation remains a pre-execution check, not a request for repeat project authorisation. No live attempt has run.
