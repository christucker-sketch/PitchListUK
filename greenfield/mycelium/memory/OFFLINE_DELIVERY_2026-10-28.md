> **Windows preflight follow-up:** connection reported successful on the intended host/neondb, PostgreSQL 18.6, no Mycelium ledger; existing neon_auth is preserved. Compatibility delta adds canonical LF checksums, an exact observed-table coexistence guard, pinned deployment host/role and tested Node 22.19 floor. Build and **19 offline checks PASS** (2+9+8). Original four canonical SQL hashes below are unchanged. Await only the narrow Windows recheck before remote-write approval; no migration has run.

# Offline delivery — memory integrity, redaction and Windows deployment

Codex, 28 October 2026. Implements Chris's direction to finish engineering locally and execute later from the already-authenticated Windows environment. No workspace Neon authentication/API key or new infrastructure is required.

## Delivered

- R1: BEFORE INSERT refuses a non-visible predecessor, closing same-statement forward-reference cycles and subject/assessor bypass. Existing 001 is byte-identical (Git blob c8e76d04026ba5df0f6baca10768f3d44e12963d). Undeployed 002 is corrected; old checksum histories fail safely.
- R2: trigger creation and revisit firing use one transactional batch, including identical-payload guards. Statement failures roll back all rows and keep due work visible. Identical concurrent/repeated firings remain idempotent; changed-payload retries abort.
- R3: paging supplies exact UTC microsecond cursor_time and UUID; JavaScript Date alone is refused as a cursor.
- R4: explicit depthLimited detection checks for unseen continuation; truncated includes depth/row/result limits, and a dead-end boundary is not falsely truncated.
- New 003: privileged payload redaction, atomic minimal audit, preserved record IDs/topology, and a private one-use update authorization. Runtime has no redaction/capability-table privileges. Assessment projections exclude redacted stances.
- All pending migrations commit atomically; exact optional NOLOGIN runtime/redactor grants are isolated in a separately gated SQL file. No blanket table grants, password creation or worker activation.
- Exact [Windows commands](WINDOWS_DEPLOYMENT.md), safe local connection configuration from captured CLI output, read-only catalog/ledger inspection, later gated migration and synthetic persistence proof. Direct driver configuration avoids unnecessary Neon init/deploy scaffolding.
- Test/build entrypoints avoid subprocess test-discovery/count ambiguity and use cross-platform Node CLI commands. No dependency added or changed.

## Validation

Build/syntax PASS. **17 offline checks PASS:** 2 original + 9 integrity + 6 targeted regression/configuration checks, run directly through npm test. Uses pinned PGlite/PostgreSQL locally; not remote Neon evidence.

Regression coverage includes least-privilege bulk INSERT cycles/bypass, injected failure at every multi-record statement, repeated/concurrent firing, precise timestamps/tie-breaking, live payload redaction of all record types, topology/history preservation, redaction role isolation, immutable audit, replay refusal after redaction, private capability cleanup, atomic migration failure, exact role SQL, and safe configuration/no-overwrite behavior. Full Windows shell and remote driver connectivity still need the documented Windows preflight; no claim of a Windows end-to-end run.

## Frozen SQL SHA256

| File | SHA256 |
| --- | --- |
| 001_memory.sql | dcd45df50d154915edc14b16e773046878f31a835d84fe1414d1dfd24d1b76d0 |
| 002_integrity_assessments.sql | f1f1b79ada5c6cc7cbd13c7ec6214ff86633be662cdf569102d0c57ff359fd47 |
| 003_redaction.sql | 7a1cd940caaf647ae5b6a5cd6a0673f85aa57250986d432183b1551650ef1310 |
| runtime_grants.sql | 7524e435c33a1c4c4f86b722e81e564f1bcb114029d62757ac77d003d17f1bc7 |

## Remaining limits and next step

Redaction clears live payloads, not copies/WAL/backups; schema owner is trusted. Capacity admission remains a soft threshold. Belief is not valid-time inference, and declared identities/correlation keys are not authenticated. NOLOGIN roles are inert privilege templates, not authenticated runtime accounts.

Next: inspect the actual Windows target/schema/ledger and compare the frozen SQL. Then obtain approval for the exact target/migration/optional role/proof block. No DDL/DML, real redaction, Neon resource, BRIX/model call, notifier, credential or production service change occurred. The completed four-turn BRIX grant remains closed. Peer review can inspect this concrete delta; do not repeat the collaboration proof.
