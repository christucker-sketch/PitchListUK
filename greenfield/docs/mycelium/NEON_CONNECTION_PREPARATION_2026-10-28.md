# Neon memory preparation checkpoint — Codex, 28 October 2026

Tracks owner [issue #1908](https://github.com/christucker-sketch/PitchListUK/issues/1908). Supersedes the earlier blanket Neon pause for **authentication, linking and read-only inspection only**. BRIX collaboration is complete; no fresh model run is needed.

## Verified now

- Existing isolated repository root: `greenfield/mycelium/memory/`, branch `findpitches-v3/greenfield`. Current implementation reviewed at `466766fe`; first migration remains unchanged, second migration is not ready because [reproducible R1–R3 defects](BRIX_MEMORY_IMPLEMENTATION_CODEX_REVIEW_2026-10-28.md) need correction.
- Build and 11 maintained offline tests pass independently, but extra probes expose gaps the suite misses. Do not confuse this with migration readiness.
- Fresh local command, using pinned CLI 8.13.0 and task-local config/cache:
  `XDG_CONFIG_HOME=/workspace/work/mycelium-neon-config npx --offline --yes --cache=/workspace/work/npm-cache neon@8.13.0 me`
  reports **Not signed in: profile DEFAULT has no stored credential**.
- Current managed environment has no Neon credential binding or outbound identity. No secret file was inspected and unrelated service credentials were not used.
- Prior Windows CLI authentication succeeded, but is separate from this executor. Earlier remote OAuth listener timed out because the browser redirected to the owner's localhost. Repeating that same login flow here will not repair routing.
- Known project metadata remains owner-supplied Windows CLI evidence: target project `raspy-silence-27774097`, org `org-square-shadow-46730629`, ready production branch `br-old-rice-zat3kd07`, database `neondb`, owner `neondb_owner`, PostgreSQL 18 London. Free plan/intended Mycelium use are owner-confirmed, not fresh authenticated billing inspection.

**Connection blocker:** no authenticated Neon identity in this executor and no database credential configured. Cannot truthfully report remote schema inspection, a configuration-plan result or a read-only SQL connection. Do not ask for tokens/connection strings in hub/chat. A supported secure credential binding for this workspace, or execution in the already authenticated owner terminal, is required. No BRIX credential/service change is needed.

## Concrete preparation sequence (not executed remotely)

1. Securely authenticate the chosen execution environment. Refresh project/org/branch/database identity and plan through read-only metadata; require matching target and no new resource need.
2. From the actual isolated memory root, link only:
   ```sh
   npx --yes neon@8.13.0 init -y --no-agent-setup --package-manager npm --org-id org-square-shadow-46730629 --project-id raspy-silence-27774097 --branch production --services postgres
   npx --yes neon@8.13.0 config plan --project-id raspy-silence-27774097 --branch production
   ```
   Windows uses npx.cmd. Initialization affects local .neon, generated .env.local (or existing .env), neon.ts, package manifests/lock and installed dependencies. Inspect local diff, preserve existing scripts/dependencies and keep credentials ignored. Do not apply the plan. No deploy is needed merely to use already-provisioned PostgreSQL.
3. With securely supplied least-privilege read access, verify endpoint/DB identity and inspect catalog/schema existence in an explicitly read-only transaction. Never print credential material. Candidate SQL:
   ```sql
   BEGIN READ ONLY;
   SELECT current_database(), current_user, current_setting('server_version');
   SELECT schema_name FROM information_schema.schemata
     WHERE schema_name NOT LIKE 'pg_%' ORDER BY schema_name;
   SELECT table_schema, table_name FROM information_schema.tables
     WHERE table_schema NOT IN ('pg_catalog','information_schema')
     ORDER BY table_schema, table_name;
   SELECT to_regclass('mycelium_memory.schema_migrations');
   ROLLBACK;
   ```
   Do not infer emptiness from the database name. Read the Mycelium ledger only if present; never adopt a preexisting unrelated schema.
4. Correct R1–R3, clarify R4 and resolve redaction semantics locally; test narrow regressions. No source/migration approval should be sought until those corrections and actual target inspection are reviewable.
5. Freeze the corrected SQL and checksums, report exact target and schema/role grants, then request separate owner authorization for that exact DDL plus one synthetic write/fresh-process read. Existing files are `sql/001_memory.sql`, `sql/002_integrity_assessments.sql`, `src/schema.mjs`, `src/memory.mjs`, scripts/database.mjs and tests. A later reviewed redaction migration/function may be needed; not invented or approved here.

## Migration effects and recovery to review before approval

The initial pair creates only mycelium_memory schema/tables/indexes/functions/triggers/view/ledger, then enforces bounds and append-only behavior on those new tables. It does not need to modify public or FindPitches schemas. A dedicated least-privilege runtime role and separate migration owner are still to be designed/approved on the verified target; cluster-wide role creation is a remote write and is not authorized now.

Each migration is transactional, **the pair is not one transaction**. If 002 fails, committed 001 remains. Prefer correction and forward recovery; do not automatically drop a schema or erase records. Capture existing schema/ledger before writes and a reviewed authenticated backup/restore method if any data already exists. An actual restore is destructive and needs its own explicit scope. Neon Free history is not an independently verified backup guarantee.

Append-only triggers deliberately remove ordinary edit/delete paths, including for mistakenly stored sensitive data. A narrowly scoped redaction path with retained identity/lineage and a nonsensitive audit record is a design candidate, not current code or granted execution. Never copy the sensitive value into the audit record. Keep this unresolved gate visible before first writes.

## Charges and scope

Metadata/link/plan commands do not request paid provisioning or a new subscription. A real SQL read may wake existing compute and consume Free allowances; workload can consume storage/compute quotas. Do not change plan, compute sizing, endpoints or billing, and stop if the real configuration differs from Free expectations.

No authentication succeeded in this executor, no init/plan ran, no remote query/SQL write or deployment occurred. No BRIX, Pi, Cloudflare, Stripe, notifier, credential or production service change. This checkpoint is a concrete draft sequence with explicit blockers, **not an executable migration approval request**.
