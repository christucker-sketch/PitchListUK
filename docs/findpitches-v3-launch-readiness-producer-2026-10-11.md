# Launch readiness, producer and Pi area (Claude): CONDITIONAL-GO

- **Author:** Claude
- **Date:** 2026-10-11, about 15:45 London
- **Scope:** review and report only. Nothing has been installed or changed for launch. This answers Chris's same-day public-launch question in [ORDERS.md](../team/ORDERS.md).

## Verdict

**CONDITIONAL-GO.** Nothing on the producer side makes a public catalogue unsafe today. The producer only supplies evidence. V3's own proof, expiry and withholding rules decide what customers see, and every producer failure mode below degrades *freshness* rather than *correctness*.

There are three conditions:

| # | Condition | Type | Owner |
| --- | --- | --- | --- |
| C1 | **Confirm which ingest environment the public catalogue reads.** The Pi runner is hard-limited to `shadow` or `test` delivery. If public V3 serves from the current store, nothing changes on the Pi. If a separate production ingest is created, the runner needs a one-line allow-list change, a new kit and a new token. | Correctness of the data path | Codex decides; Claude ships a kit if needed |
| C2 | **Rotate to a fresh ingest-only token before going public** (B5 from the original issue register). The current token has been in service since shadow testing. | Security hygiene | Codex mints it; Chris runs `sudo fpd-set-token` on the Pi |
| C3 | **Launch monitoring must alert on producer staleness.** Alert when there has been no Pi contact or delivery for more than 1 hour, when delivery has failures, and when the source age is more than 6 hours. V3 already records Pi contact and cadence (Codex, 14:58 today), so this is a threshold in ChatGPT's monitoring plan, not new code. | Operations | ChatGPT (plan) / Codex (alert) |

## Evidence (latest observations)

| Area | State | Source / time |
| --- | --- | --- |
| Delivery | Every 15 minutes. Latest: 2,096 accepted, **0 rejected**, 0 consecutive failures. | Pi status, 2026-10-11T11:20Z |
| Delivery, V3 side | Authenticated Pi poll 14:58:35 London, cadence `true` | Codex, 15:10 London |
| Lifecycle feed | Live since 2026-10-10 about 12:00. Closures, withdrawals and watch moves reach V3, and the 119-record first delivery was verified by Codex. | Handovers, 10 October |
| Recheck backlog | Runner reads every page (V3-001 kit). The Pi-side count fell from 1,390 to 320 by 11 Oct 11:20Z; V3 reports 845 native pending at 15:04 London (a different counting basis). Each cycle examines all requests and re-queues up to 300. | Pi status / Codex |
| Source freshness | Discovery every 3 hours, so source age is typically 1–3 hours and the runner's freshness flag is usually on. V3 proof time-to-live and expiry handle staleness: expired proof is withheld, not shown stale. | Pi status / CURRENT_STATUS |
| Pi health | RAM 254–415 of 905 MB, disk 1.1 of 220 GB, 43–52 °C. **Power: live under-voltage seen (`0x50005`)**; the PSU replacement is pending. | Pi status, 10–11 October |
| Off-site backup | Configured and proven. Encrypted Google Drive (`drive.file` scope), nightly at 05:40, 14 days kept, first run 11 Oct OK (34 MB). A restore onto spare hardware has not been tested. | Handover 11 October |
| Source custody | Producer source is in `producer/`, and the running kit's hash has been verified. | V3-003 |

## What happens if the Pi fails during launch

This is a failure of freshness, not of correctness. Delivery stops and Pi-sourced proof gradually expires and is withheld by V3. New closures stop arriving, but expiring proof also removes stale open listings.

Recovery path:
1. Restore from the off-site backup to new hardware, following `RESTORE.txt`.
2. Get a new token.
3. Restart.

Identity ids survive, because the identity registry is in the database. A realistic recovery time with spare hardware is a couple of hours. Without spare hardware, it depends on getting a new Pi.

**Codex to confirm** how much of the public READY catalogue depends on Pi-delivered evidence, as opposed to V3's own direct source verification. Earlier figures showed the producer contributing to about 898 READY across origins, with 401 exclusive. That share defines the impact of a Pi outage.

## Nashville (V3-001): not a launch blocker

**Custody, as the producer holds it:**

- **Old id `fdx1_f889ad736b6a93511de5`:**
  - Natural key `US|site:nashvillefarmersmarket.org:nashville farmers market|standing`.
  - Last delivered as ROLLING with `last_checked` 2026-10-04T16:19:06Z.
  - Since then carried forward as retired / WITHDRAWN ("not produced by the engine for 3 consecutive exports").
  - Its page was refetched on 2026-10-10 at 17:37:12Z, but the id is no longer produced, so its record cannot refresh.
- **Survivor `fdx1_5c40d2efe2d7096eb916`:**
  - Natural key `US|marketspread:12766|2027`, current OPEN_NOW, `last_checked` 2026-10-10T20:34:09Z.
  - Its anchors include both of the old id's anchors: `url:https://www.nashvillefarmersmarket.org/apply-farmers-market` and the Marketspread vendor URL.

**What the producer cannot supply:** evidence that the old "standing" (undated) record and the survivor's 2027 edition are the *same edition*. The producer merged two engine opportunities on shared anchors. That is a dedupe decision, not edition proof. I agree with Codex: no relink and no forced acknowledgement.

**Safe to stay withheld:** yes. The old id is retired and not customer-visible, and the survivor stands on its own proof. Leaving the old request pending, or resolving it as superseded or obsolete with an operator audit like the other two, affects nothing else in the catalogue.

## What a public launch changes for the Pi

**Nothing, unless C1 or C2 applies.** The cadence, the feed and politeness stay the same.

Recommended but not blocking:
- **Crawler contact:** set the crawler's contact string `FPD_CONTACT` in `/etc/fpd/fpd.env` to a FindPitches address rather than a personal or work mailbox, so the public crawler identifies the business (issue-register item S10).
- **Kit:** install the pending kit (V3-011 work, safe in shadow), or defer it until after launch.
- **PSU:** swap it as soon as it arrives.

## Smallest safe same-day sequence (producer side; not executed)

1. Codex answers C1. If a new environment is needed, Claude ships a runner kit with a test, and Chris installs it (about 15 minutes).
2. Codex mints a new ingest-only token. Chris runs `sudo fpd-set-token` and then `sudo fpd-status`, which should show `delivered` with 0 rejected (about 10 minutes).
3. ChatGPT and Codex add the C3 staleness alerts to launch monitoring.
4. Optional: set `FPD_CONTACT`, install the pending V3-011 kit, swap the PSU.

**Rollback for this area:** keep the old token valid until the new one shows a clean delivery, then revoke it. If a new environment kit misbehaves, reinstall the previous kit; all of them are kept in `C:\Users\ChrisT`.

## V3-011, reported separately: no launch effect

READY impact so far: **0 new READY** (Codex, 15:10).

Producer fixes made today, in the kit after `1ce097c9…`:
- LocalStalls organiser extraction now takes the organiser name from the page's Event JSON-LD, or from the "By …" line. Frequency labels such as "One-off / Irregular" or "Annually" are stripped. This fixes the AU contamination Codex found.
- Explicit-year Event JSON-LD dates are now used when the page lists no "Coming dates". Previously such events were wrongly marked HISTORICAL; one example is the 29–30 Nov Christmas Tree Farm Markets.
- 100 tests pass, using sanitised AU fixtures.

A cleaner organiser string alone will not clear V3's retained conflicts. That needs Codex's reviewed conflict path.
