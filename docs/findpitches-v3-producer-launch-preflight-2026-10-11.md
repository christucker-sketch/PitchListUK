# Producer and Pi launch preflight, 11 October 2026 (Claude)

- **Observed:** 2026-10-11T17:09:55+01:00 (16:09:55Z). Read-only scripts were run on `fpd-pi` by Chris. No secrets were printed and nothing was changed by the check.
- **Responds to:** [CLAUDE_LAUNCH_SUPPORT.md](../team/CLAUDE_LAUNCH_SUPPORT.md) priorities 1–2.
- **Earlier review:** [launch readiness, CONDITIONAL-GO](findpitches-v3-launch-readiness-producer-2026-10-11.md).

## Verdict: CONDITIONAL-GO, with one producer-side condition

**Condition: the hotfix kit `95c08051…` is installed and one discovery cycle exports successfully.**

Until that happens, freshness is degraded. Correctness is not affected:
- delivery keeps running every 15 minutes with 0 rejected, but it re-sends the 12:41 export;
- V3's proof TTL and expiry rules still decide what customers see.

**This is not a customer-correctness blocker.** The cause was my regression (below), not a launch dependency.

C1 to C3 from the earlier review are now settled as follows.

| | Status |
| --- | --- |
| **C1 (ingest environment)** | **Closed.** Codex (15:42 and 16:05) confirmed that public V3 keeps the existing immutable shadow ingest and evidence path. No producer environment change and no Pi kit change are needed for launch. |
| **C2 (token)** | **Deferred to after launch, by design.** Codex reports the endpoint holds a single key, so a rotation without interruption needs tested overlap support first. The current token is unchanged, ingest-only and readable only by `fpdv3`. No producer action is needed before launch. |
| **C3 (monitoring thresholds)** | **Proposed values:** see the thresholds below. |

**C3 thresholds for launch monitoring:**

| Signal (all already recorded by V3 or in the Pi status) | Warn | Page |
| --- | --- | --- |
| Authenticated Pi poll / delivery | No contact for more than 45 minutes (3 missed deliveries) | No contact for more than 2 hours |
| Delivery result | Any `rejected` greater than 0 | 2 or more consecutive failures |
| Producer source age (newest `last_checked` among current records) | More than 4 hours (one missed discovery cycle) | More than 7 hours (two missed cycles) |

The source-age figure moves in steps every 3 hours, because discovery runs every 3 hours. The runner's own `freshness_warning` fires above 1 hour, so it is on for most of every cycle and is not a useful page signal. Use source age.

## Regression found and fixed: export validation (my fault)

**What happened:**
- Kit `b7c60c3a…` (V3-011 MarketsIreland, ClueMart and LocalStalls work) was installed before the 15:21 cycle; the 12:15 cycle had exported normally.
- The 15:21 cycle crawled normally, but **`export full` failed validation**: `$.discovery_source: 'marketsireland' not in enum`.
- The service exited with code 2 at 15:47:24, and the previous export was left intact.

**Cause:**
- `records.source_of()` returned the lane name `marketsireland`.
- That value is not in the v1 schema's `discovery_source` enum, which is part of the V3 contract.
- The unit tests never validated a MarketsIreland record against the schema.

**Fix:**
- That lane now emits `discovery_source: "other"`, with `discovery_source_detail: "marketsireland"`. This is the path the schema already defines for platforms without their own value.
- The enum is not widened during launch.
- A new regression test checks that every configured acquisition lane maps to values in the schema enums.

**Verification:**
- The failure was reproduced locally on a copy of the producer database after a real MarketsIreland run (48 pages), with exactly the same error.
- After the fix: `export full`, `export-validate` and `v3-feed` all pass, with 5 IE OPEN_NOW records.
- The producer ids are unchanged, because ids don't depend on `discovery_source`.
- 101 tests pass.
- Kit `pi_kit_v3-011d.tgz`, `SHA256SUMS` `95c08051…`. Only `fpd/integration/records.py` and `tests/test_integration.py` differ from the installed kit.

**Effect on V3:**
- No rejected deliveries.
- Every 15 minutes, 2,101 records were re-sent from the 12:41 export.
- The 300 rechecks the 15:21 cycle fetched are in the database but not yet exported. They reach V3 on the first successful cycle.

## Fresh observations (16:09:55Z unless stated)

| Area | Observation |
| --- | --- |
| Discovery cycles today (London) | 06:18–06:54 ok · 09:14–09:39 ok · 12:15–12:41 ok · **15:21–15:47 failed (export validation, above)**. The next timer run is 18:16; a manual run will follow the hotfix install. |
| Export / feed | Feed written at 12:41:13 London: 2,101 records (1,846 current + 255 lifecycle). Newest current `last_checked` is 11:39:53Z. 188 of 1,846 current records were checked within the last 6 hours. |
| V3 delivery | Active, 0 restarts. Last at 16:04:26Z: 2,101 accepted, **0 rejected**, 0 consecutive failures, `unchanged_export` true since 11:58:39Z. Source age 4.4 hours, freshness warning on. |
| Recheck handoff | V3 polled at 16:04:18Z: **977 pending**. Last three handoffs: 430 → 318 → 912 requests. The 14:13Z handoff was 300 queued, 590 deferred and 22 already fresh. The budget is 300 re-queues per cycle, so about 2,400 per day at 8 cycles. |
| Off-site backup | `ok: true`, status at 2026-10-11T12:40:52Z, database backup `20261011T0320Z`. The service's last result is `success`. The next timer run is 12 Oct at 05:44 London. Not yet tested: a restore onto spare hardware. |
| Power | `throttled=0x50000`: **no under-voltage at the time of the check**, but under-voltage and throttling have occurred since boot (6 Oct 01:27). There were 0 kernel under-voltage or OOM lines in the last 12 hours. The PSU swap is still pending. |
| Host | 47.8 °C, RAM 240 of 905 MB, disk 1.3 GB of 220 GB, up 2 days 22 hours. |
| Installed kit | `b7c60c3a…`. Hotfix `95c08051…` is pending install. |

## Nashville: withheld, with custody evidence for Codex

**Producer side:**
- **Old id `fdx1_f889ad736b6a93511de5`:** channel `retired`, lifecycle `WITHDRAWN`, `last_checked` 2026-10-04T16:19:06Z. It is not current and cannot become current under that id. Its V3 request from 2026-10-09T18:47:53.640Z is still pending.
- **Survivor `fdx1_5c40d2efe2d7096eb916`:** current, OPEN_NOW. It has a new V3 request, `requested_at` 2026-10-11T13:41:48.008Z.

V3 reports 0 Nashville customer-visible (Codex, 16:43).

**What Codex asked for:** source and edition custody for the old occurrence (2026-10-10) against the survivor's (2027-02-28). Here it is.

**The producer registry and the export state:**

| | Old `f889ad…` | Survivor `5c40d2…` |
| --- | --- | --- |
| Minted | 2026-10-05T11:47:19Z (same export) | 2026-10-05T11:47:19Z |
| Registry key | `US\|site:nashvillefarmersmarket.org:nashville farmers market\|standing` | `US\|site:marketspread.com:nashville farmers market\|2027`; the current record key is `US\|marketspread:12766\|2027` |
| Engine opportunity | 2338, ROLLING. Evidence: "Marketspread: “Apply here” (next date 2026-10-11, 61 upcoming; **season 2026-03-01–2027-02-28**)" | 2346, OPEN_NOW. Evidence: "live application route for an upcoming edition (**event 2027-02-28**)", `event_date_basis: text` |
| Source | nashvillefarmersmarket.org/apply-farmers-market (its "APPLY TODAY" button links to Marketspread application 6679) | marketspread.com/…/apply/6679/login/ |
| Shared anchors | `…/apply/6679/vendor/` and the organiser apply URL | Both of those, plus `pid:marketspread_market:12766` (9 Oct) |
| Last exported | 2026-10-09T14:30:13Z, then absent for 3 exports, so withdrawn | Current |

**The public source, re-read 2026-10-11T16:06:13Z.** Marketspread market 12766, HTTP 200, 397,668 bytes, sha256 `9bf6b8a0b8ba0c64…`:
- **122 trading dates are listed, from Sun 11 Oct to Sun 28 Feb.** Every date sits under the same single application: "2026 Application- 3/1/2026 - 2/28/2027".
- No other application or season is shown.
- The organiser's page says the market trades on more than 350 days a year.

**Conclusion (producer custody, not a V3 decision):**
- There is **one application season, 1 March 2026 to 28 February 2027**, and no separate 2027 edition.
- The old record's 2026-10-10 date is a trading day inside that season.
- The survivor's 2027-02-28 is **the season's last day**. The generic text extractor read it from the application page as an "upcoming edition" date.
- The `2027` edition key is therefore a producer labelling defect, not evidence of a second edition.

**What I am not doing:** I am not rewriting the survivor's key during launch. Doing so would mint a new id. Whether `f889ad` → `5c40d2` is resolved as a supersession within one season, or both stay withheld, is Codex's call on this evidence.

**Producer fix, queued for after launch:**
- Marketspread application and login pages must not supply edition dates; the season-aware market-page adapter should.
- The record should carry the season window rather than a single "event" date.

## V3-001: exact current state

All of these are done:

| Item | Evidence |
| --- | --- |
| All-page recheck paging | Done |
| Exact three-field acknowledgements | Done |
| Every request examined, with a re-queue budget | Done |
| Three fresh, acknowledged lifecycle traces (Fiesta trace retained end to end) | Codex-verified |
| Two audited obsolete past-edition resolutions (`86aaebe…`, `9b04c3e…`) | Codex, 14:37 |

**The one remaining condition:** Codex reviews the Nashville custody above and records an outcome: a supersession within one season, or keep both withheld with the request left open. Either outcome closes V3-001. Nothing is being forced.
