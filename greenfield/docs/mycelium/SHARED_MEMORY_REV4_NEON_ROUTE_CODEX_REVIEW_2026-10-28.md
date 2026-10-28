# Codex — Neon-compatible trial route review, 28 October2026

Reviewed `7a49e5781436fce0d9105d0bc4a90898eee35c21`. **PASS for the revised bounded proposal with the execution gates below; no new attempt authorized yet.** This is a material change from the earlier verifier-only route and needs a fresh explicit owner approval.

## Observed status

Node22.23.4 installation is reported complete from approved b61d77da, official tarball hash pin enforced and version/npm output recorded. Existing command inventory is reported preserved. Installer check/hash output was not fully pasted; this is the host report, not direct Codex host audit. Do not reinstall Node.

Trial attempt2 stopped at create-login. The original script deliberately hid the server error text/SQLSTATE, so the precise first error was not captured. Read-only reconciliation reported the explorer role absent, then host close/teardown and PC closure completed; no fixture rows were written. Only approved Node remains. No active trial credential/role is reported.

## Provider constraint verified

Independently consulted [Neon roles documentation](https://neon.com/docs/manage/roles), Manage roles with SQL, lines220/237: passwords require at least60bits entropy and must be supplied in plain text; hashed passwords are not supported. This confirms the earlier SCRAM design is incompatible even though local PostgreSQL/PGlite accepts it. Both earlier reviews missed that provider-specific requirement. It is consistent with the reported failure; do not invent a captured server error.

Creating the limited role with SQL remains appropriate: roles created via Neon CLI/Console/API get broader neon_superuser membership. Do not switch provisioning to those interfaces.

## Revised source and validation

- fpd-prod generates40 URL-safe characters from30 cryptographic random bytes and rejects disallowed patterns. The SQL literal accepts only the constrained alphabet, excluding quotes/backslashes; attempt UUID is independently validated.
- One private password file now goes via SSH to Chris's already-trusted Windows owner environment, then TLS to Neon. The migration-owner password never goes to fpd-prod. No password/URI in CLI arguments or hub.
- Host/owner receipt and exact-attempt role-comment checks remain; foreign roles and pre-existing paths are preserved. Scope/call/row/time bounds unchanged. Diagnostic messages redact the known password, URL and long tokens.
- **Build,8 focused Node tests and30 shell tests PASS independently** (fake/local only). Claude reports35 Node/15 PowerShell checks; pwsh unavailable here, so the15 were source-reviewed/reported, not independently rerun. Earlier unchanged adapter evidence retained.
- Source now removes unused SCRAM verifier code. No schema/adapter migration needed.
- Script SHA256 matches:
  - host `fb8e3805e173de235ea8287d59dc7ea5dbac22c2b77f69f884d163bcc8569a3d`
  - PC `0aca3b6519a0e27bf066d05404a0df0429489acbf0b31b62a5cb14e5b518d9b4`

## Mandatory private-copy gates for this approval

The owner script attempts overwrite/delete in finally and logs absence, but suppresses filesystem cleanup exceptions. Therefore **a CREATE OK line alone is not permission to run the host proof**. Claude's execution script/procedure must enforce these additional explicit gates:

1. Before scp, confirm `C:\Users\ChrisT\mycelium-explorer.pw` is absent (including an existing link/file), and existing attempt receipt is absent. Refuse, never overwrite a prior file. Use the private local user profile, no shared/sync location or paste/attachment.
2. Copy only the reviewed host's new one-time file over SSH. Do not print/read it into an agent transcript, command line, receipt or log.
3. Run the PC create step at the full pinned commit below. Whether it exits normally, refuses during a precheck, or fails, the wrapper must remove only its just-copied file (attempt overwrite/delete) in its own finally. This covers early script refusals before the inner cleanup is entered.
4. Explicitly test that the PC file is absent before host run. If it remains or create/verify was nonzero, **STOP**, run attempt-scoped owner close/read-only reconciliation and host close, and report the remaining private file for owner removal. Do not log success or continue while cleanup failed. No new role retry.
5. Logical deletion/overwrite is not certified erasure of SSD/backups. No password should enter logs/chat/backups to begin with. Always collect actual cleanup/closure receipts.

These are execution conditions, not authority to delete a pre-existing/unowned PC file. They must be included in Claude's one-command Windows wrapper and sanitized log.

## Exact proposed fresh approval

Pin **7a49e5781436fce0d9105d0bc4a90898eee35c21**, using [delivery section8 revision4](SHARED_MEMORY_ADAPTER_DELIVERY_2026-10-28.md), which supersedes obsolete verifier/.scram commands in section5.

- Same existing production/neondb target and tested isolated mycmem host setup.
- Exactly one new attempt-bound temporary mycelium_explorer_fpd login, runtime inheritance only, SET/ADMIN false, limit2.
- Only credential-route change: new host `/home/ct_admin/mycelium-explorer.pw` → private Windows file `C:\Users\ChrisT\mycelium-explorer.pw` over SSH → TLS SQL provisioning; guarded overwrite/delete/absence receipts on PC, host copy shredded.
- Six DB-only processes, <=90s each/300s total, exactly6nodes+6edges+2assessments, zero model calls. No extra attempt or automatic retries.
- Mandatory attempt-scoped login disable/revoke/read-only closure, host credential closure and optional recorded-resource teardown. Existing foundation/Neon Auth/services unchanged; Node remains installed.
- No new API key, workspace auth, owner credential on workers, paid service, runner/CLI bridge, schema change or automatic dispatch.

Approval phrase: **“approved: revised Neon-compatible memory trial”**. This approval is needed because the prior grant pinned different code and promised a verifier-only transfer. Prior project/install/setup approvals remain valid; do not ask for them again.

After approval Claude coordinates the established script/Chris-command/log route with the private-copy gates above and posts actual SQLSTATE (sanitized), membership/6-6-2 footprint/timing/deletion/verified closure receipts. No new trial is claimed by this review.
