# Codex completion review — Mycelium Neon memory, 28 October 2026

**PASS / approved setup complete**, based on [Chris/Claude's Windows execution report](NEON_MEMORY_DEPLOYMENT_EVIDENCE_2026-10-28.md) at `884fc0ab`. Codex inspected the complete published delta; it changes evidence/hub documentation only. No direct Codex Windows/Neon/provider audit is claimed.

## Scope and outcome accepted

The report ties execution to owner approval `6e34f52b` / `9c6f32fe`, an empty memory-code diff against reviewed `c3e0936f`, matching frozen canonical SQL hashes, and the correct production/neondb target. Preconditions retain the nine existing neon_auth table names and no prior Mycelium ledger. All write steps exit 0; no retries reported.

- Migrations 001_memory, 002_integrity_assessments and 003_redaction committed; ledger records the three reviewed canonical checksum prefixes matching the delivery record.
- Both NOLOGIN roles exist with superuser/createdb/createrole/replication/bypassrls flags false. Runtime grants are SELECT/INSERT on graph tables, SELECT on projections/audit and retry-helper EXECUTE; no mutation/redaction/private-capability/ledger grants. Redactor has redact EXECUTE and no table privileges.
- Exactly two benign synthetic nodes and one edge committed. The reported fresh-process read verified their IDs, kinds and relationship; the proof manifest remains on the PC for reconciliation. No repeat write/read proof is needed.
- Final Mycelium relation inventory matches the planned tables/view; existing Neon Auth table inventory is preserved. This is not a row-by-row audit of Neon Auth data. The approved SQL is scoped to Mycelium objects/new role names.
- The temporary write-approval environment flag was removed. No real redaction, login/password creation, explicit additional role-membership grant, Neon deploy/configuration change, model call or notifier is reported.

## Creator membership observation

The report observes neondb_owner as a member of both newly created roles. Reviewed runtime_grants.sql contains no GRANT-role-membership statement. PostgreSQL can automatically grant role administration to the role creator; Claude reproduced that on PGlite 18.6. **Neon's actual admin_option/inherit_option/set_option values were not queried.** Do not substitute the local reproduction for remote evidence.

This is not a setup blocker: neondb_owner is already the trusted migration/schema owner, the new roles cannot log in, no application login or automated dispatch is enabled, and direct runtime/redactor privilege checks match the approved templates. Do not modify membership or issue another write grant merely to make the observation disappear. Before any future authenticated runtime/redactor activation, inspect actual memberships/options and approve that specific credential/membership plan separately.

## Completion boundary

The cloud persistent memory foundation now exists and its bounded persistence proof is reported successful. It is not a running organism or an authenticated BRIX/app memory integration. NoLogin roles are privilege templates. Live-payload redaction is installed/tested offline but was not exercised remotely; backup/WAL/external-copy erasure is not promised.

Existing GitHub communications and BRIX proofs remain unchanged/closed. No further setup test, paid resource, credential/key, model run, real redaction or infrastructure change is implied. No setup action remains pending. Further useful memory integration can be scoped from this completed foundation under owner direction.
