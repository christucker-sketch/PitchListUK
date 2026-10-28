# Mycelium memory: Windows deployment plan, 28 October 2026

**Preflight update (28 Oct):** Windows connection succeeded at `ep-little-thunder-zahn9b42.c-2.eu-west-2.aws.neon.tech`, neondb/neondb_owner, PostgreSQL 18.6. No Mycelium ledger exists. The nine existing neon_auth tables are explicitly allowlisted for coexistence and never modified. The driver supports Node >=19; existing Windows Node 22.19 ran all 17 original checks, so this package's minimum is now the tested 22.19, not an unnecessary PC upgrade. SQL checksums are canonical LF across CRLF checkouts; .gitattributes pins future SQL checkouts to LF.

Prepared for review; **remote migration/role creation/smoke writes are not yet approved or executed**. Use Chris's existing authenticated Windows Neon CLI. No ChatGPT workspace credentials, new API keys, BRIX work, Neon deploy, new compute or paid plan is needed.

## Scope and files

Run only from the actual checkout's `greenfield/mycelium/memory/` on `findpitches-v3/greenfield`, after fetching this reviewed commit through the existing GitHub workflow. Preserve local work; do not reset or force-push. Stop if local files differ from the reviewed SQL.

- `sql/001_memory.sql`: original new Mycelium schema/graph/ledger; unchanged.
- `sql/002_integrity_assessments.sql`: assessments, validity, payload bounds, immutability and corrected predecessor validation. Never applied remotely; checksum changed intentionally. Any recorded older checksum causes refusal, not silent adoption.
- `sql/003_redaction.sql`: minimal audit table, private one-use update capabilities, privileged redaction function and atomic retry guard.
- `src/schema.mjs`: validates all recorded checksums before changes; all pending migrations commit in **one transaction**. No existing schema is adopted. Unknown/checksum-mismatched histories abort.
- `sql/runtime_grants.sql`: optional, separately gated creation of two inert **NOLOGIN** cluster roles, scoped grants only in this database. It refuses pre-existing names. No passwords, membership grants or application dispatch. Runtime gets graph SELECT/INSERT and read projections only; redactor gets only schema usage/function execution. Do not grant ALL TABLES or default privileges: the capability/audit tables must remain protected.
- Local generated files: `.env.local` (credential, ignored), node_modules; `.smoke/proof.json` (synthetic ids, ignored). No secret goes to GitHub or output.

## Redaction contract

Ordinary appends remain immutable. `mycelium_memory.redact(type, subject_uuid, reason_code, event_uuid)` is the sole sanctioned payload-mutation path for trusted privacy/credential removal. PUBLIC/runtime cannot execute it. The migration owner or an explicitly authorized redactor can.

Node redaction clears kind/title/body/attributes/provenance; edge redaction clears relation/attributes/provenance; assessment redaction clears declared assessor/correlation key and neutralizes stance/weight. UUIDs, graph endpoints, basis/supersession references and timestamps remain. Redacted assessments are excluded from belief projections. Audit contains IDs/type, a fixed code (`credential`, `privacy`, `legal`, `owner_request`), login identity and database time—no original payload or payload digest. Calls on an already-redacted subject return the existing audit id. Update and audit commit/rollback together.

The private capability table is not a general runtime bypass: no runtime grants, transaction/backend/row binding, consumed by the update trigger. The schema/database owner remains trusted and can alter DDL; this is not tamper-proof against its owner.

Redaction removes the **live row payload**, not prior backups/WAL, exports, duplicated text in other records or external logs. Do not claim certified erasure of all copies. Inspect and redact linked copies separately; backup retention/purge policy remains a deployment/operations responsibility. Do not run a real redaction as a connectivity test.

## 1. Offline preparation — no database changes

In PowerShell, navigate to your actual checkout (do not use System32). Check branch and directory:

```powershell
git branch --show-current
Set-Location .\greenfield\mycelium\memory
Get-Location
node --version
npm.cmd ci --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Offline tests failed' }
node .\scripts\sql-hashes.mjs
if ($LASTEXITCODE -ne 0) { throw 'Canonical SQL hash check failed' }
```

Node must be >=22.19.0. Do not continue if tests fail. Compare canonical LF hashes with the accompanying reviewed delivery record. Raw Get-FileHash values may differ on an existing CRLF checkout; only CRLF is normalized, and other byte changes still fail checksum verification. npm downloads existing pinned dependencies; it makes no Neon change.

## 2. Existing target and local connection configuration — read-only remotely

```powershell
npx.cmd --yes neon@8.13.0 projects get raspy-silence-27774097
npx.cmd --yes neon@8.13.0 branches list --project-id raspy-silence-27774097
npx.cmd --yes neon@8.13.0 databases list --project-id raspy-silence-27774097 --branch production
```

Require project FindPitches/intended Mycelium use, org org-square-shadow-46730629, production branch br-old-rice-zat3kd07 and neondb. Confirm Free plan in the console; do not change plan/compute. Next capture the existing connection string **without displaying it**:

```powershell
$myceliumConnection = & npx.cmd --yes neon@8.13.0 connection-string production --project-id raspy-silence-27774097 --database-name neondb --role-name neondb_owner --ssl require
if ($LASTEXITCODE -ne 0) { throw 'Existing connection lookup failed' }
try {
    $myceliumConnection | node .\scripts\configure-local.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Local configuration refused' }
} finally {
    Remove-Variable myceliumConnection -ErrorAction SilentlyContinue
}
node --env-file=.env.local .\scripts\database.mjs inspect
if ($LASTEXITCODE -ne 0) { throw 'Read-only database inspection failed' }
```

The helper refuses an existing `.env.local`; never overwrite an unknown local credential file. It checks Neon TLS/owner/neondb and prints only host/database/role. Verify that printed host against Neon Console. `.env.local` uses the dedicated MYCELIUM_DATABASE_* variables. Windows file permissions inherit the user's directory ACL: keep the checkout on the owner's private user profile, not a shared/synced directory, and do not attach the environment file or logs containing credentials.

`inspect` runs catalog/identity/ledger queries inside explicitly read-only transactions. Stop on unexpected user tables outside the nine observed neon_auth names in target.json, an existing unknown Mycelium schema/ledger, wrong database or role, or a checksum mismatch. Capture the non-secret results for review. If data already exists, agree on an authenticated backup and tested restore procedure before migration; do not invent one or assume a Free history window is a complete backup.

**No Neon init or config apply/deploy is necessary:** PostgreSQL is already provisioned. Directly configuring the dedicated driver avoids generated service configuration/dependency changes. Retrieving its existing URI makes no new resource. SQL reads can wake compute/consume existing Free allowances; no paid plan/commitment is authorized.

## 3. Only after approval of this exact migration + proof

Approval must identify the reviewed commit/hashes, inspected host/neondb/production target, three migrations, optional two NOLOGIN roles, and the synthetic proof. First-time expected state: no Mycelium schema; the nine observed neon_auth tables may coexist unchanged. The migration script refuses every other non-Mycelium user table, including unknown names in neon_auth. Do not run this block merely because it is documented:

```powershell
$env:MYCELIUM_REMOTE_WRITES_APPROVED = 'yes'
try {
    node --env-file=.env.local .\scripts\database.mjs migrate
    if ($LASTEXITCODE -ne 0) { throw 'Migration failed: stop and inspect; do not retry blindly' }
    # Run only if the separate NOLOGIN role setup is included in the approval:
    node --env-file=.env.local .\scripts\database.mjs roles
    if ($LASTEXITCODE -ne 0) { throw 'Role setup failed: stop and inspect' }
    node --env-file=.env.local .\scripts\database.mjs smoke-write
    if ($LASTEXITCODE -ne 0) { throw 'Proof write failed or uncertain: reconcile with smoke-read; do not rerun write' }
} finally {
    Remove-Item Env:\MYCELIUM_REMOTE_WRITES_APPROVED -ErrorAction SilentlyContinue
}
node --env-file=.env.local .\scripts\database.mjs smoke-read
if ($LASTEXITCODE -ne 0) { throw 'Persistent proof read failed: stop and inspect' }
node --env-file=.env.local .\scripts\database.mjs inspect
```

Role setup is a separate atomic transaction. If roles are not approved, omit those two lines. No secret/login creation is necessary for this bounded owner-driven proof. The NOLOGIN roles are tested privilege templates, not a running application's authenticated connection; a future runtime-login/membership change requires its own explicit plan. Do not run the organism with owner credentials.

The synthetic proof writes exactly two benign nodes and one edge and saves stable IDs before the write. The separate read process verifies persistence; it does not repeat the write. Do not delete the manifest after an uncertain outcome, because it is the reconciliation key. Synthetic records remain marked in memory; no destructive cleanup is included.

## Stop/recovery

Any migration transaction failure rolls back **all pending schema changes**. Previously committed migrations stay intact. Unknown network publication outcome requires read-only inspect/ledger reconciliation. Fix forward after review, never automatically DROP SCHEMA, reset roles, disable triggers or delete history. The role transaction may succeed even if the later smoke test fails; inspect it instead of rerunning role creation. No production FindPitches/V1/V2/V3, Cloudflare, Stripe, BRIX, Pi or communications service is involved.

## Existing Windows configuration: narrow recheck after the preflight fix

The confirmed checkout is `C:\Users\ChrisT\PitchListUK`; `.env.local` already exists and must be preserved. Claude can use the existing one-script/local-log workflow. Do not rerun configure-local, create keys or change Node/services.

```powershell
Set-Location C:\Users\ChrisT\PitchListUK
if ((git branch --show-current) -ne 'findpitches-v3/greenfield') { throw 'Wrong branch' }
git pull --ff-only origin findpitches-v3/greenfield
if ($LASTEXITCODE -ne 0) { throw 'Update failed; preserve work and stop' }
Set-Location .\greenfield\mycelium\memory
npm.cmd ci --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Install failed' }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
node .\scripts\sql-hashes.mjs
if ($LASTEXITCODE -ne 0) { throw 'Hash check failed' }
node --env-file=.env.local .\scripts\database.mjs inspect
if ($LASTEXITCODE -ne 0) { throw 'Read-only target inspection failed' }
```

Expected canonical SQL hashes are unchanged from OFFLINE_DELIVERY_2026-10-28.md. The actual observed endpoint is now pinned in target.json; deployment scripts refuse another host/database/migration role. Free plan remains Chris-confirmed; the CLI metadata did not independently establish billing. No authentication or remote writes are part of this recheck.
