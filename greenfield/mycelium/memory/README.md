# Mycelium persistent memory

Standalone package at **greenfield/mycelium/memory/**. Governing intent: [founding vision](../../docs/mycelium/FOUNDING_VISION_OWNER_DIRECTIVE_2026-10-27.md). Memory supports open-ended discoveries, many-parent branches, cross-links, contradictions, failures and rediscovery. It does not dispatch models or impose a project hierarchy.

**Prepared and tested offline; not deployed.** Use the [exact Windows deployment plan](WINDOWS_DEPLOYMENT.md). Chris's existing authenticated Windows Neon CLI is the execution environment. No workspace secrets/API keys or `neon deploy` are required.

## Store and API

- Nodes/edges have free kind/relation vocabulary, JSONB metadata and provenance. Graph cycles and multiple parents are allowed.
- Assessments address either a node or edge, keep weighted stances, declared evidence independence, validity and predecessor history. Multiple heads remain visible rather than silently reconciled. Belief is a head projection, not an as-of-valid-time query or authenticated truth.
- Ordinary writes are append-only, with payload-conflict-safe retries. Revisit trigger creation and firing are atomic. Revisit predicates are an initial convenience API; generic graph storage remains open-ended. No query result automatically launches a probe/model.
- Bounded traversal reports row/result/depth truncation. Connections return exact `cursor_time` plus UUID for paging; preserve these fields instead of converting timestamps through JavaScript Date.
- `pg_database_size` admission is a soft, per-write threshold with headroom, not a concurrent hard quota. Payload bounds supplement it.
- [Migration 003](sql/003_redaction.sql) supplies privileged live-payload redaction with minimal audit and preserved IDs/topology. Ordinary runtime cannot invoke it. Copies/backups/WAL require separate retention handling; this is not a certified all-copies purge.

## Local checks

Node >=22.20.0; pinned Neon driver 1.2.0 and PGlite 0.5.12. No new dependencies or paid calls.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
```

Tests run a local PostgreSQL engine, including durable reopen, graph/assessment integrity, multi-row supersession rejection, transaction fault injection, microsecond pagination, redaction privilege isolation, atomic migrations and exact runtime grants. They do not establish remote Neon readiness.

## Isolation and deployment boundary

Dedicated MYCELIUM_DATABASE_URL/HOST/NAME variables only. Never use inherited FindPitches DATABASE_URL. Local .env files, .neon, node_modules and .smoke are ignored. Never print or commit credentials.

Migrations are an ordered checksum-validated chain: original 001, corrected not-yet-deployed 002 and new 003. All pending migrations commit together. An unexpected schema/version/checksum stops instead of adopting or overwriting it. Optional explicit NOLOGIN role setup is a separate transaction, creates no credential and enables no worker. No blanket ALL TABLES grants.

Read-only Windows target/schema inspection precedes approval. Later approved setup creates only Mycelium objects, followed by two synthetic nodes/one edge and a fresh-process persistence read. No automatic DROP/rollback deletion. See WINDOWS_DEPLOYMENT.md for exact commands, gates, effects, recovery and limitations.

No FindPitches V1/V2/V3, Cloudflare, Stripe, BRIX, Pi or existing communications service is modified.
