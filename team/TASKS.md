# FindPitches V3 shared work board

States: `OPEN`, `CLAIMED`, `BLOCKED`, `DONE`. Owner means an actual published claim, not a suggested role. No initial tasks are silently assigned to Claude or ChatGPT. Claiming a task does not authorize paid spend or production changes.

When claiming, fill the owner, claimed/updated timestamp (Europe/London with offset), planned files/components and next checkpoint. Fetch first and publish the claim before overlapping work. Narrow shared-component edits need coordination with the current owner. Link completion evidence; do not mark a task DONE merely because an acknowledgement or export exists.

| ID | Priority | Work / completion evidence | State | Owner | Planned components / dependency |
| --- | --- | --- | --- | --- | --- |
| HUB-001 | P0 | Create shared hub, evidence-linked dashboard and per-AI update files; push feature branch and verify GitHub readability | DONE | Codex | `team/`, root agent entrypoints; documentation only |
| V3-001 | P1 | Execute all-page exact-ID producer rechecks and retain a real closure/held/retired → export → identity → acknowledgement → unavailable preview trace | CLAIMED | Claude | Producer host/runner + V3 recheck contract; host access and retained evidence needed |
| V3-002 | P1 | Restore legitimate UKCraftFairs source custody/access and prove retained event/application routes; quantify actual READY gained without weaker rules | CLAIMED | Claude | Producer evidence + source verifier; 154 held GB entities are review population only |
| V3-003 | P1 | Copy independent discovery engine and host deployment source into an owned separate package with hashes and reproducible instructions | DONE | Claude | `producer/fp-discovery-lab/` + `producer/SOURCE_SHA256SUMS` + [custody README](../producer/README.md); D-011 |
| V3-004 | P1 | Design and test controlled recognition of existing subscribers in V3 using canonical ownership/entitlement; no duplicate charges or live migration | OPEN | Unclaimed | Native customer/billing + read-only legacy comparison; any real migration stays gated |
| V3-005 | P1 | Complete the hosted Stripe TEST browser checkout/cancellation/customer journey and retain evidence | OPEN | Unclaimed | Customer UI/billing/browser checks; TEST only, no live objects |
| V3-006 | P2 | Prepare native alert delivery with bounded recipient/duplicate controls, then obtain explicit recipient/send authorization before actual messages | OPEN | Unclaimed | Customer alerts/email; storage exists, delivery remains disabled |
| V3-007 | P1 | Expand source-proved UK supply beyond Mynt using official multi-event operators and regional/nation-specific application routes | OPEN | Unclaimed | Source-specific adapters; free direct-source work only, measure READY and organisers |
| V3-008 | P2 | Measure real-origin latency, customer browser/security behaviour and supported source-backed facets/geography | OPEN | Unclaimed | Standalone frontend + customer API; unknown fields stay unknown |
| V3-009 | P1 | Attribute every external/Pi paid client and document account protection before any later acquisition recommendation | OPEN | Unclaimed | Read-only spend/producer audit; no new searches or acquisition enablement |
| V3-010 | P1 | Review commercial launch acceptance and a concrete domain/billing/publication/cutover/rollback plan | OPEN | Unclaimed | Product + engineering review; execution requires explicit operator approval |

Suggested starting points: Claude can assess V3-001/V3-002/V3-003 with producer access; ChatGPT can review V3-010 and commercial acceptance; Codex can implement backend/customer tasks and verify supplied evidence. These are suggestions until each contributor claims work.

## Active claim details

- **HUB-001 / Codex / claimed 2026-10-10T10:55:11+01:00:** documentation hub setup only; no code deployment, paid search, customer email or production change. Completed 2026-10-10T10:56:28+01:00. Initial publication `0ff3b4dd58a5f0b43a1489639289e5be0ad45489`; all 12 files read from GitHub with HTTP 200 and exact content-hash matches. No follow-on task claimed.

- **V3-001 / Claude / claimed 2026-10-10T11:00:22+01:00:** Pi recheck runner follows `next_cursor` to exhaustion and acks exact `producer_record_id`/`entity_id`/`requested_at`; retain one real lifecycle trace. Feed enabled by Chris ~12:00 London; first feed delivery 2,044 accepted / 0 rejected / 119 inserted (see HANDOVERS). Components: producer `deploy/pi` runner and kit only (host install by Chris). No cloud/D1 edits. Next checkpoint: kit ready for Chris to install.
- **V3-002 / Claude / claimed 2026-10-10T11:00:22+01:00:** sanitized sample of Pi-retained UKCraftFairs event/application routes for the 154 held GB entities, plus a source-access options note. No READY rule loosening; no cloud edits. Next checkpoint: evidence note in `docs/`.
- **V3-003 / Claude / claimed 2026-10-10T11:00:22+01:00; completed 2026-10-10T11:53:41+01:00:** Chris approved (D-011). 81 files committed under `producer/fp-discovery-lab/`; hashes in `producer/SOURCE_SHA256SUMS` match the PC working copy the Pi kit was built from (`sha256sum -c` exit 0) and the engine inside the installed kit archive; 88 tests pass. No data, exports, credentials or CI wiring. Pi verified 2026-10-10T11:56+01:00: installed `/opt/fpd/kit/SHA256SUMS` = `d7639f7b…` and `sha256sum -c` passed (run by Chris).

Use the per-agent [update template](templates/UPDATE.md) for the claim's timestamp, files, checks, blockers and next action. Preserve prior task IDs when work is split or superseded; add a new row rather than repurposing an old ID.
