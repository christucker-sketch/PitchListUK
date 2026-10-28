# Mycelium memory foundation — prepared, not provisioned

Governing vision: [founding owner directive](../../docs/mycelium/FOUNDING_VISION_OWNER_DIRECTIVE_2026-10-27.md). Mycelium is a general-purpose exploratory network. This package supplies persistent memory, not a task scheduler or communications framework.

## Isolation and model

Project root: **greenfield/mycelium/memory/**. This is a standalone private Node package with its own manifest, lockfile, dependencies, SQL, tests and secret ignores. The repository root package is the PitchList landing page; V3 has separate operations/web packages. None is an appropriate Neon root. Existing hubsync, stageb, notify and task files are siblings and are unchanged. No root scripts, workflows, BRIX/Pi services or FindPitches databases are edited.

Two graph tables in a new **mycelium_memory** schema:

- **nodes**: a UUID, open-ended kind, title/body, JSONB attributes/provenance, observed/recorded timestamps. Kinds may include discovery, branch, hypothesis, experiment, evidence or learned_result, but there is no database enum or mandatory root/parent/objective.
- **edges**: UUID, source/target node IDs, open-ended relation, JSONB attributes/provenance and timestamp. Any nodes can connect, including cycles, cross-links and many-parent merges. Useful relations include spawns, supports, contradicts, derived_from and supersedes; none is prescribed.

Failed experiments remain records with outcomes/evidence rather than disappearing. The application API is append-only: corrections and reinterpretations can be new linked records. This is an API convention, not tamper-proof storage or a database-enforced immutable log. The schema does not enforce one workflow, require a central planner, run models or generate embeddings. Provenance JSONB should retain source identifiers, observed times and content digests where available; storing a claim does not certify its truth.

Version/checksum tracking is separate in schema_migrations. The migration is atomic, creates only this new schema and refuses an existing unrecognized schema or changed applied checksum. There is no FindPitches data copy, import, DROP or shared public table.

**Migration `002_integrity_assessments` (28 Oct 2026, offline only)** implements the BRIX exchange's agreed design ([result](../../docs/mycelium/BRIX_MEMORY_COLLAB_RESULT_2026-10-28.md)):

- assessments on nodes or edges, with supersession and independence keys;
- enforced append-only (triggers);
- validity intervals and payload bounds;
- in the API: capacity admission, keyset paging, cycle-safe traversal, idempotent retries, a secret refusal, and the four revisit predicates.

`npm test` runs 11 tests on PGlite. Not applied to Neon.

## Prepared files and local verification

`package.json`, `package-lock.json`, `.gitignore`, `.env.example`, `target.json`, `sql/001_memory.sql`, `src/{connection,schema,memory}.mjs`, `scripts/{check,database}.mjs`, `test/memory.test.mjs` and this README.

Node >=22.20:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm test
```

Build checks JavaScript syntax; there is no app/server bundle to deploy. Tests use **PGlite's local PostgreSQL engine**, including a disk-backed close/reopen. They exercise unrestricted kinds, branching/merging/cycles, failed-learning retention, provenance, bound SQL parameters, foreign keys, duplicate IDs, atomic rollback, migration checksums and connection-target/TLS guards. No Neon account, remote database or cloud resource is used. Local tests are not a Neon connectivity proof.

Pinned dependencies: @neondatabase/serverless 1.2.0 (HTTPS PostgreSQL driver); @electric-sql/pglite 0.5.12 (local tests only). Lockfile contains integrity hashes. CLI 8.13.0 was inspected as a downloaded npm archive, not initialized or authenticated. No global CLI installation is necessary.

## Approval boundary and costs

**Nothing below has been executed. Owner approval is required before init/deploy, acquiring branch credentials, remote SQL or writes.** All commands run ONLY from this package directory. Target is the owner-supplied org `org-square-shadow-46730629`, project `raspy-silence-27774097`, existing branch `production` (its name does not authorize touching FindPitches production).

First confirm in Neon Console that the IDs are the dedicated Mycelium project, the owning organization/project is on **Free**, production is the intended branch, and there is no paid commitment. The environment inspected has no configured Neon identity/database credential. Do not paste secrets into GitHub/chat or start an unrelated login flow automatically.

Current published Free allowance is $0, 1 GB database storage/project and 100 CU-hours/project/month. Paid plans charge compute/storage usage, so an existing paid organization is not made free by these commands. CLI linking, env pulls and SQL checks are not proof of a free subscription; SQL can wake compute and writes consume quota. Do not upgrade plans, add paid features or silently accept overages. Free is a constrained starting foundation, not unlimited storage or guaranteed production durability; budget future growth, export/backups and retention separately. Do not order paid backups now.

## Exact proposed sequence — stop after read-only plan first

The first requested approval is **initialization/linking plus read-only plan only**, contingent on confirmed Free status/target. `--no-agent-setup` is intentional: default `init -y` may install global skills/MCP/plugins, outside this package. `npx` avoids a global CLI install and the exact version avoids a moving latest.

```bash
# From a reviewed checkout, repository root:
cd greenfield/mycelium/memory
umask 077
export npm_config_cache="$PWD/.npm-cache"
npx --yes neon@8.13.0 init -y --no-agent-setup --package-manager npm --org-id org-square-shadow-46730629 --project-id raspy-silence-27774097 --branch production --services postgres
npx --yes neon@8.13.0 config plan --project-id raspy-silence-27774097 --branch production
```

Expected local effects: `.neon` context; `.env.local` (or existing `.env`) with branch credentials; generated `neon.ts`; package.json/package-lock.json/node_modules changes for @neon/config and @neon/env; potentially updates to this package's .gitignore. CLI cache/auth state lives outside the repository according to its own configuration. On this executor use a task-local npm cache, not a home-directory write. All generated credential/context files are ignored. Initialization may retrieve credentials/contact the management API: that is also deferred. It must link the exact existing IDs, not create a fallback project/branch.

After initialization, review the exact generated configuration/plan **before any apply**. In CLI 8.13.0, Postgres-only initialization writes a starter policy containing `auth: false` and a conditional TTL for new non-default branches. We must not assume it is harmless to an existing branch with other services. If plan proposes disabling existing Auth/Data API, protection/compute/TTL changes, new resources or anything outside this foundation: stop and revise the proposal. Do not use deploy -y, --update-existing or --allow-protected as blanket overrides.

The later apply command, **only after that actual plan is approved**, is:

```bash
npx --yes neon@8.13.0 deploy --project-id raspy-silence-27774097 --branch production
```

`neon deploy` applies the configuration policy and normally refreshes the local environment file; it **does not run our SQL migration**. If Postgres already exists and the plan is a no-op, the simplest path may skip configuration deployment altogether and use the authenticated connection. No Functions, Data API, Auth, Object Storage or AI Gateway is required.

## Later schema/connectivity commands — separate remote-change approval

After verifying the target connection in the Neon Console, privately edit the ignored environment file to add MYCELIUM_DATABASE_URL (copy of the generated dedicated DATABASE_URL), MYCELIUM_DATABASE_HOST (the exact approved Neon endpoint), and MYCELIUM_DATABASE_NAME. Never echo/log these values or put them in shell history. We deliberately do not use ambient DATABASE_URL, which could belong to another application. Keep .env.local mode 0600. Host/name matching prevents accidental cross-app connection; it is not proof of Neon project ownership, which is verified separately.

```bash
node --env-file=.env.local scripts/database.mjs check
MYCELIUM_REMOTE_WRITES_APPROVED=yes node --env-file=.env.local scripts/database.mjs migrate
MYCELIUM_REMOTE_WRITES_APPROVED=yes node --env-file=.env.local scripts/database.mjs smoke-write
node --env-file=.env.local scripts/database.mjs smoke-read
```

Effects and acceptance:

1. check: authenticated HTTPS SELECT 1 only; can wake compute, consumes Free quota but no schema changes.
2. migrate: creates mycelium_memory schema, nodes/edges/migration ledger, constraints and indexes, revokes PUBLIC schema/table privileges; commits once with checksum; repeat returns already applied.
3. smoke-write: commits **two synthetic nodes and one supports edge** and creates ignored `.smoke/proof.json` locally before the request. It refuses to overwrite that manifest, preventing blind retry after uncertain success. These three synthetic rows deliberately remain as a small durable acceptance record.
4. smoke-read: a separate Node process reads the committed records and verifies their relationship, proving persistence beyond the writer process. Rerun reads freely within quota; after an uncertain write, read/reconcile before any new write. There is no automatic retry/cleanup deletion.

The environment guard prevents accidental writes; setting it is not an alternative to owner approval. No remote SQL/build/e2e step has run during preparation. Runtime errors are sanitized so credentials and SQL payloads are not printed. Local schema tests cover branching and failures; the approved Neon tests will separately prove authenticated cloud transport and durable read/write.

## Authentication and exposure

No HTTP application, unauthenticated Data API or public local Postgres listener is created. Neon is reached using password-authenticated PostgreSQL credentials over HTTPS via its driver; the dedicated URL requires an explicit matching endpoint/database and sslmode=require or verify-full. No TLS verification is disabled. A Neon endpoint can be internet-addressable: authentication is mandatory, and we are not claiming private networking.

The initial generated database-owner connection is for approved bootstrap/checks in a private environment, never a browser or public service. Before any persistent worker/service integration, create a separately reviewed least-privilege Mycelium-only role (read/write only this schema, no schema administration) and store it in a secret manager. Role creation/credential provisioning is not done by this preparation. No changes to V1/V2/V3 roles or credentials, Cloudflare, Stripe, BRIX or Pi.

## Official references checked 27 October 2026

- https://neon.com/docs/cli/init
- https://neon.com/docs/cli/deploy
- https://neon.com/docs/cli/env
- https://neon.com/docs/serverless/serverless-driver
- https://neon.com/pricing

The exact 8.13.0 npm archive README/config template was also inspected locally to confirm the flags, context-file effects and starter-policy defaults. Do not infer the supplied account's plan or current branch configuration from public documentation.
