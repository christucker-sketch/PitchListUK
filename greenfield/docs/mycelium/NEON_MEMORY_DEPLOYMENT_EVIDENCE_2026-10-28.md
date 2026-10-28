# Mycelium memory on Neon: approved migration, roles and persistence proof, evidence (28 Oct 2026, 12:37Z)

Carries out Chris's approval **"approved: Mycelium Neon migration, roles and persistence proof"** (recorded in `6e34f52b` / `9c6f32fe`) with exactly the recorded block. It used the established route:

- Claude wrote `C:\Users\ChrisT\mycelium-write.ps1` (sha256 `a024ef77…`) and the read-only `C:\Users\ChrisT\mycelium-grant-check.mjs` (`4c3a3c11…`), both outside the repo.
- Chris ran the script once; Claude read the sanitised log `mycelium-write.log`.

Claude cannot type into a PC terminal, so no direct PC shell is claimed.

**Outcome: DONE, every step exit 0. All values below are observed from the log, not expected.**

## Preconditions (before any write)

- Checkout fast-forward `3e542f77..9c6f32fe`. `git diff c3e0936f HEAD -- greenfield/mycelium/memory` was **empty**: the reviewed code ran, with no source delta.
- The canonical SQL hashes equal the frozen delivery record: `001` `dcd45df5…`, `002` `f1f1b79a…`, `003` `7a1cd940…`, `runtime_grants` `7524e435…`.
- Node v22.23.4; the existing `.env.local` was reused; no `.smoke/proof.json` existed beforehand.
- **Read-only inspect before writing:** `neondb`/`neondb_owner`, PG 18.6 (4e5fd08), only the 9 `neon_auth` tables, no ledger. The pinned-target guard passed.

## Writes (approved scope only)

| Step | Output | Exit |
|---|---|---|
| `migrate` (001/002/003 in one transaction) | `Mycelium-only schema migration applied.` | 0 |
| `roles` (one transaction) | `Created two Mycelium-only NOLOGIN roles and explicit grants. No credential/login change or dispatch.` | 0 |
| `smoke-write` | `Committed two synthetic nodes and one edge` | 0 |

`write-approval flag removed: True`, cleared in a `finally` block.

## Read-only verification (fresh processes)

- **`smoke-read`:** `Fresh-process read verified both committed nodes and their relationship.` The synthetic ids are:
  - discovery `d5043607-66f6-432b-a51f-0a980a59b35f`
  - result `f687d254-1872-48c9-9d5a-ba3715d5c3b2`
  - edge `5dfdb57e-546c-4618-a64c-90e591b94d9d`

  The manifest is kept in `.smoke/proof.json` (ignored).
- **Ledger:**

  | Version | Checksum |
  |---|---|
  | `001_memory` | `dcd45df5…` |
  | `002_integrity_assessments` | `f1f1b79a…` |
  | `003_redaction` | `7a1cd940…` |

  These are the canonical LF checksums, identical to the delivery record.
- **Tables after the run:**
  - `mycelium_memory` holds assessment_heads (view), assessments, edges, nodes, redaction_authorizations, redactions, schema_migrations.
  - **The 9 `neon_auth` tables are unchanged** (account, invitation, jwks, member, organization, project_config, session, user, verification).
  - There are no other user tables.
- **Roles** `mycelium_memory_runtime` and `mycelium_memory_redactor` are both `rolcanlogin=false`. Superuser, createdb, createrole, replication and bypassrls are all false.
- **Runtime grants are exactly:**
  - SELECT and INSERT on nodes, edges and assessments;
  - SELECT on assessment_heads and redactions;
  - EXECUTE on `require_identical_retry`;
  - **no** UPDATE, DELETE or TRUNCATE anywhere;
  - **no access to `redaction_authorizations`** (the private capability) or `schema_migrations`;
  - **no EXECUTE on `redact`**.
- **Redactor grants:** EXECUTE on `redact` only (not `require_identical_retry`), and no table privileges.
- **Memberships:** `neondb_owner` appears as a member of both new roles. **The roles SQL grants none.** This is PostgreSQL 16+'s automatic grant to the creating (non-superuser) role. It was reproduced on PGlite 18.6 as `admin_option=true, inherit_option=false, set_option=false` with the default `createrole_self_grant`. It lets the owner manage the roles, but gives no inherited or SET privileges. The flags were not queried on Neon; Codex may want to note or accept them.
- **Secret scan of the log:** no matches. No connection string, password or environment value was printed.

## Not done

- no real redaction;
- no login, password or extra membership grant;
- no Neon deploy or config change, no plan or compute change;
- no model call or notifier;
- no other service.

No retry was needed. `.env.local` and `.smoke/proof.json` remain on the PC only.

**Next:** Codex reviews this evidence and reports completion or any limitation.
