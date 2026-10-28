# Mycelium memory: Windows read-only Neon preflight, evidence (28 Oct 2026, 11:52Z)

Carries out the [Chris-authorised read-only preflight](../../../team/HANDOVERS.md) routed to Claude in `bbbea294`, following [WINDOWS_DEPLOYMENT.md](../../mycelium/memory/WINDOWS_DEPLOYMENT.md) steps 1–2. **Nothing was written remotely**: no migrate, roles, smoke-write, redaction, `neon deploy`, model call or plan or compute change.

## How it ran (and the capability gap)

**Claude could not run PowerShell on the PC directly.** The desktop computer-use bridge grants terminals in click-only mode, so Claude cannot type into them. Claude's local shell is a Linux VM that cannot use the Windows Neon CLI sign-in.

So Claude wrote the runbook's steps into `C:\Users\ChrisT\mycelium-preflight.ps1` (sha256 `66db4976…`; outside the repo). Chris ran that one command, the same pattern as `claude-sync.ps1`, without relaying any credential or output. Claude then read the sanitised log `C:\Users\ChrisT\mycelium-preflight.log` through the VM.

**Credential handling:**

- the connection string was held only in a PowerShell variable;
- it was piped to `configure-local.mjs`, which wrote the git-ignored `.env.local` (present, holding the three `MYCELIUM_*` names; values not read);
- the variable was then removed.

A scan of the log for `postgres://`, `npg_` and `password` matched only a test name.

## Results

| Check | Result |
|---|---|
| Checkout | `C:\Users\ChrisT\PitchListUK`, branch `findpitches-v3/greenfield`, 0 local changes; fast-forward `466766fe..bbbea294` |
| Node | **v22.19.0**: below the package's `engines >=22.20.0` (npm did not enforce it) |
| Offline | `npm ci` ok; build ok; tests **2 + 9 + 6 = 17/17 pass** |
| Neon project | `FindPitches`, `raspy-silence-27774097`, org `org-square-shadow-46730629` (matches `target.json`), `aws-eu-west-2`, Postgres 18, default compute 0.25–2 CU, history retention 6 h, created 2026-10-27T16:13Z |
| Branch | `[default] production` `br-old-rice-zat3kd07`, ready (matches the runbook) |
| Database | `neondb`, owner `neondb_owner` (the only database) |
| Endpoint host | `ep-little-thunder-zahn9b42.c-2.eu-west-2.aws.neon.tech` / `neondb` / `neondb_owner`. Compare with the Neon Console before any write |
| Server | PostgreSQL `18.6 (4e5fd08)`, the same major and minor version as the PGlite tests |
| User tables | **9 tables in schema `neon_auth`**: account, invitation, jwks, member, organization, project_config, session, user, verification. No other user tables |
| Mycelium ledger | absent (`mycelium_memory.schema_migrations` does not exist): first-time state |
| Exit | `DONE: preflight complete; nothing written remotely` |

## Mismatches to resolve before any remote-write approval

1. **The SQL bytes differ from the reviewed hashes, because of line endings.** The Windows checkout converts the `.sql` files to CRLF; every line ends in `\r`. The Windows hashes, for example `001` `81f86df6…`, are exactly the reviewed LF files with CRLF added. The reviewed hashes are `001` `dcd45df5…`, `002` `f1f1b79a…`, `003` `7a1cd940…`, `runtime_grants` `7524e435…`, and Claude's Linux checkout matches them.
   - **Consequence:** `migrate` computes checksums from file bytes. A ledger written from Windows would record the CRLF checksums, and any later run from an LF checkout (fpd-prod, CI, the cloud agents) would refuse with "checksum mismatch". It fails closed, but blocks.
   - **The runbook says to stop when the hashes differ.**
   - **Suggested fix (Codex's package):** add `.gitattributes` `greenfield/mycelium/memory/sql/*.sql text eol=lf` and re-check-out those files on Windows. Alternatively, normalise CRLF to LF before hashing in `schema.mjs`. Then re-hash on Windows.
2. **`neon_auth` exists, so the guard in `database.mjs migrate` would refuse:** "Unexpected non-Mycelium tables". The project has Neon Auth provisioned, while `target.json` lists `services: ["postgres"]` only. Codex, or Chris, decides: either `migrate` explicitly tolerates exactly the `neon_auth` schema (owned by Neon, untouched by Mycelium), or Neon Auth is removed from this project. Removing it is a project change, so it is not done here.
3. **The Node version is below the engines floor** (22.19.0 against 22.20.0). The tests passed, but the floor exists for a reason; Codex should say whether 22.19 is acceptable or the PC needs a Node update before writes.
4. **The plan is not shown by the CLI.** Free status still needs Chris's check in the Neon Console, as the runbook requires.

## State left

- `.env.local` holds a credential and is git-ignored, on the PC only.
- `node_modules/` is installed.
- `C:\Users\ChrisT\mycelium-preflight.ps1` and `.log` hold no secrets. Delete them whenever you like.
- Existing compute may have woken within the Free allowance. Nothing else changed.

**Next:** Codex reviews the target and schema evidence and mismatches 1–3, then presents the exact remote-write approval. No write is authorised by this preflight.

## Narrow recheck after Codex's fix `c3e0936f`: PASS (28 Oct 2026, 12:07Z)

Ran the runbook's "Existing Windows configuration: narrow recheck" block, unchanged. It went into `C:\Users\ChrisT\mycelium-recheck.ps1`, which Chris ran once; Claude read the sanitised log. The existing `.env.local` was kept; configure-local was not rerun, and there was no sign-in or key.

- **Checkout:** 0 local changes; fast-forward `8ab88a52..fc100905`.
- **Node:** **v22.23.4**. Chris updated it from 22.19.0 via `winget install OpenJS.NodeJS.22` before Codex lowered the floor, so it clears either floor.
- **Offline:** build ok; tests **2 + 9 + 8 = 19/19**, including CRLF/LF ledger equivalence and the pinned catalog and target guards.
- **Canonical SQL hashes equal the reviewed delivery record exactly:** `001` `dcd45df5…`, `002` `f1f1b79a…`, `003` `7a1cd940…`, `runtime_grants` `7524e435…`. **Mismatch 1 is resolved.**
- **Pinned-target inspect succeeded**: `assertDeploymentTarget` passed. It showed `neondb` / `neondb_owner`, PostgreSQL 18.6 (4e5fd08), and exactly the same 9 `neon_auth` tables (now the allowlisted untouched schema). There is still no Mycelium ledger. **Mismatches 2 and 3 are resolved.**
- **Log:** a secret scan matched only a test name. `DONE: recheck complete; nothing written remotely`.

No migrate, roles, smoke-write, redaction, deploy or model call. **Next:** Codex presents the exact remote-write approval to Chris.
