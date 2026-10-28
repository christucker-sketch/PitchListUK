# Codex review — explorer memory adapter and proposed live trial, 28 October 2026

Reviewed `2e9adbaa14d1303189b58f8cac3bba7f5f0891db`. **Useful adapter and real offline cross-process reuse demonstrated; targeted source corrections and a fully executable trial plan are required before live approval.** No host, credential, database or model action is authorized/executed by this review.

## Independent results

- Build/syntax PASS.
- Previous 19 checks PASS; 5 other adapter checks PASS; 4 provisioning/live-fixture checks PASS: **28 maintained checks independently pass**.
- The remaining maintained adapter test fails here because this executor refuses Node child-process spawning (`spawnSync(process.execPath,...)` gives `error.code=EPERM`, empty stdout, even a reported status 0). The test attempts JSON.parse on empty stdout. This is a measured executor constraint, not evidence of a broken PostgreSQL adapter. Check r.error as well as status in the test/demo to make failures intelligible.
- Using ordinary execution-tool commands instead of Node's child-process launcher, ran A and B as separate fresh processes over one durable local PGlite directory. B found A by phrase, reused all four A records and added its cross-branch result with three links/two stances. The direct two-process behavior succeeds. I do not claim the complete 29-test npm run passed here.
- SCRAM RFC vector and stored-verifier/provisioning/runtime guards pass the four fixture checks. No actual Neon SCRAM login or host setup was tested.
- Existing migration SQL is not changed by this adapter commit. Reuse of the existing transactional insertion guard is appropriate.

## R1 — renderer exceeds its advertised hard byte limit

`src/explorer.mjs render()` reserves only a short placeholder suffix while accumulating lines, but appends a longer actual truncation message. A crafted small valid recall object with a 737-character first body and two large subsequent bodies, graph truncated=true, yields **1025 bytes for maxBytes=1024**.

**Fix:** budget the exact final suffix/fence before returning, retain complete JSON records and make Buffer.byteLength(output)<=cap an invariant for all paths. Add boundary/multibyte/graph-truncated regressions rather than just a representative 40-record case. Keep the untrusted-data warning and fence; do not silently truncate inside a record.

## R2 — assessments against returned links disappear from recall and render

Reproduced using the public adapter:
1. Contribute A.
2. Contribute B with relation causes to A; retain B.links[0].
3. Contribute evidence C with a contradicts stance, weight0.9, against that edge.
4. Recall from A.

Direct memory.belief({edge: B.links[0]}) returns the contradiction. The recalled edge is present, but recall.stances[edgeId] is absent, and rendered output contains no contradictory stance. recall invokes belief only for nodes; render prints stances only beneath node records. This loses the existing capability to question a relationship, central to the memory design.

**Fix:** return and render assessments for recalled edges as well as nodes with explicit type/identity. Bound the number of included edges/stance queries and expose omissions/truncation. Add an end-to-end link-assessment recall/render regression under runtime privileges. No schema change is needed.

## R3 — the live plan is not yet an exact executable/closing plan

The database-side provisioning statements are concrete and appropriately gated; the host-side section still paraphrases shell actions. It does not give a pinned archive/extraction command, precise destination collision checks, exact credential file creation/permissions command, complete executable entrypoint/cleanup, or an overall wall-clock deadline. Fifteen seconds per database request is not a whole-proof bound.

**Required:** provide reviewed one-shot host/Windows script(s) or full copyable commands, pinned to the delivered commit, with:
- refusal/reconciliation when the Unix user, /opt destination or credential/verifier destination already exists; never delete/reuse unrelated files on rollback;
- exact root-owned package extraction, dependency install and credential permissions, without owner credentials on fpd-prod;
- private verifier handling (a verifier is still sensitive; do not log/commit it), and cleanup on every error as well as success;
- an explicit finite overall trial timeout and no automatic retry;
- default login disable/membership revoke and credential/verifier removal even when any trial step fails; if disconnected/uncertain, describe the precise owner-side recovery and do not claim cleanup succeeded;
- receipts proving closure and exact row footprint, with existing rows preserved;
- actual Neon membership-option read before activation and least-privilege check as proposed.

Use the existing script/Chris-one-command/sanitized-log execution route, not a new service/coordinator. No host or credential step now. Do not present an incomplete setup script for owner approval.

## Small contract corrections in the same delta

- recall maxResults currently counts newly found neighbours, not supplied seed records. With 20 isolated starts and maxResults1 it returns 20 items, truncated=false. Existing tests intentionally expect 11 items at cap10 from one start. Either enforce a TOTAL returned-node budget or rename/document a neighbour budget and give the real total bound (including deduplicated starts). Clarify this rather than claiming <=200 payloads/stance queries.
- Filter/mark edges whose endpoints are omitted; the current contract says links between returned items, while neighbourhood can include edges outside the result budget.
- Fixture synthetic=true is on the main contributions, not automatically evidence/edge/assessment rows. Tag supporting fixture data where fields exist or document the exact deterministic run/ID lineage used to identify all14 rows; don't claim every row has a boolean synthetic marker.
- Section4 must not claim the CLIs have no network access as an enforced fact. Claude tools are removed; Codex's tool prohibition is prompt-level with a read-only sandbox. Correct this previously resolved distinction.

## Handoff / authority

**Claude next:** one narrow source/test/plan revision addressing R1–R3 and the contract descriptions. Repository/offline work is already authorized; no new project permission or real model test needed. Codex reviews the actual delta and then presents a concrete bounded live approval if ready.

The proposed L1 is database-only fixture integration, not actual CLI↔Neon explorer reasoning; that distinction is transparent and should remain so. The described L2 bridge is still out of scope, and no new model calls or autonomous dispatch are granted. Keep the completed cloud foundation and its original proof closed.
