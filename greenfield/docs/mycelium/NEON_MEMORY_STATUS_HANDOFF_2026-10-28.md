# Mycelium Neon memory — status and handoff, 28 October 2026

Author: Codex. Posted at Chris's request. Scope: isolated cloud memory foundation in `greenfield/mycelium/memory/`, following the [founding vision](FOUNDING_VISION_OWNER_DIRECTIVE_2026-10-27.md). This is not a FindPitches V1/V2/V3 database migration.

## Prepared repository work

Foundation published in commit `db05aa5c62bf2a5e7f4eb547bc72ec0db68877ba`: standalone package, pinned Neon driver, flexible node/relationship schema with JSONB attributes and provenance, guarded database connection, checksum migration and persistent read/write proof scripts. Build and two offline tests passed in the preparation session using local PGlite; these are not remote Neon connectivity results. No remote migration has been executed.

## Existing Neon resources

Evidence below comes from Chris running pinned Neon CLI 8.13.0 on Windows and pasting read-only command output, plus explicit owner confirmation. Codex has not independently authenticated to Neon.

| Item | Evidence |
| --- | --- |
| Project | `raspy-silence-27774097`, display name `FindPitches` |
| Organisation | `org-square-shadow-46730629` |
| Intended use | Chris confirms this project is intended for Mycelium; the display name is intentional because Mycelium is FindPitches' development engine |
| Plan | Free tier, confirmed by Chris; not independently verified via billing/API |
| Region | `aws-eu-west-2` (London) |
| PostgreSQL | Version 18 |
| Default compute configuration | 0.25–2 CU, as reported by project inspection |
| History retention | 6 hours |
| Branch | Default `production`, ID `br-old-rice-zat3kd07`, state `ready` |
| Database | Existing `neondb`, owner `neondb_owner` |
| Created | Project, branch and database on 27 October 2026 around 16:13 UTC |

Existing PostgreSQL/database resources are sufficient for the proposed foundation; no new resource provisioning is currently indicated. These metadata checks do not establish whether neondb contains other data. No SQL inspection, application connectivity or remote read/write proof has occurred. Endpoint host/connection details have not been collected.

## Authentication and present blocker

Codex cloud workspace CLI browser login timed out after 60 seconds. OAuth redirected to `127.0.0.1` on Chris's Windows machine rather than the remote workspace callback listener. Windows CLI authentication subsequently worked, as demonstrated by successful project/branch/database reads. That local credential does not authenticate Codex's workspace. No tokens or connection strings have been requested in chat or committed.

The earlier suggestion that a Windows login would connect this workspace was incorrect; local CLI inspection is the currently working path. No BRIX machine is needed.

## Authority and remaining steps

Chris already authorizes authentication, initialization/linking of this existing project from `greenfield/mycelium/memory/`, and read-only configuration planning. Do not ask for the same project authorization again. The Windows checkout location is not yet confirmed; latest prompt asks Chris to enter the actual local checkout memory directory and report `Get-Location`. Do not initialize from `C:\\Windows\\system32` or a FindPitches application directory.

Once the actual isolated checkout is confirmed, the prepared pinned commands are:

```powershell
npx.cmd --yes neon@8.13.0 init -y --no-agent-setup --package-manager npm --org-id org-square-shadow-46730629 --project-id raspy-silence-27774097 --branch production --services postgres
npx.cmd --yes neon@8.13.0 config plan --project-id raspy-silence-27774097 --branch production
```

Initialization has NOT run. It can create local .neon context, .env.local (or update an existing .env), neon.ts and modify package.json/package-lock.json/node_modules via generated Neon dependencies. Review generated configuration and package changes, preserve existing work, and keep all credentials and .neon/.env files excluded from Git. The no-agent-setup flag avoids global agent/plugin setup. Read-only planning has NOT run; do not apply its changes. These commands are intended to link/inspect existing resources, with no paid resource creation or subscription commitment authorized.

After linking: inspect sanitized plan and endpoint/database identity, securely configure the package's dedicated MYCELIUM_DATABASE_* variables, then report readiness. The package deliberately does not consume generic DATABASE_URL automatically. Do not share raw generated environment files or connection URLs. Database/schema writes remain a later explicit approval gate: apply only the Mycelium schema, then a bounded synthetic graph write and a fresh-process persistence read. A read-only connection check can precede those writes once securely configured.

## Boundaries retained

No neon deploy/config apply, SQL migration, remote write test, paid resource, other-project modification, automatic AI dispatch, BRIX/Pi change, Cloudflare/Stripe change or production FindPitches service/database change. No credentials changed. Existing GitHub communications remain untouched by the memory implementation. Stage B and the completed decision-chain collaboration proof stay closed; do not repeat them.

Next actor: Chris confirms the Windows checkout memory directory; Codex/Chris then complete the already-authorized local link and read-only plan. Claude can review this handoff and existing memory package without host changes or model tests.
