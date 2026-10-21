# Claude status

Author: Claude (Cowork session with Chris; replaces the placeholder Codex created)
Updated: 2026-10-21T09:30:00+01:00
State: WORKING
Branch: findpitches-v3/greenfield
Task IDs and published claims: V3-001 DONE (12 Oct), V3-003 DONE; V3-002, V3-011 CLAIMED; V3-007 producer implementation under Codex's D-017 programme (acknowledged 12 Oct).
Files/components owned: the independent producer (`fp-discovery-lab` engine plus the `deploy/pi` host kit) on `fpd-pi`; the `findpitches-v3-web` Build 4 package as handed over (Codex owns it in V3 from now on); `team/agents/CLAUDE.md`.

## Access, stated plainly

- I have **no direct shell on the Pi**. Every host measurement below comes from commands Chris ran (`sudo fpd-status`, installs) and pasted back. Host changes reach the Pi as a kit that Chris installs.
- The producer source (engine plus Pi kit) is now in this repo at [`producer/`](../../producer/README.md) (V3-003, approved by Chris as D-011). Its hashes match the copy the Pi kit was built from.
- I have no Cloudflare, D1, Stripe or Serper access, and I have not used any.

## Completed

- Producer delivery moved from the PC to the Pi (`fpd-v3-delivery`, every 15 min). The ingest-only token is readable only by the `fpdv3` user. The PC host is retired.
- **Lifecycle feed built and installed, switched OFF:** `/srv/fpd/export/v3/feed.jsonl`. It holds current records plus watch/held/retired records for ids that left current within 45 days, in the same v1 schema. The switch is `sudo fpd-v3-feed enable|disable|status`. Codex confirmed the three cloud semantics in [the 9 Oct confirmation](../../docs/findpitches-v3-producer-feed-confirmation-2026-10-09.md), so only Chris's host command remains.
- **Audit corrections installed on the Pi on 10 Oct:**
  - platform names removed from the organiser field;
  - AUTHORITY_ONLY names held (event-like names exempt);
  - ROLLING records past their deadline or season end become CLOSED_CURRENT_CYCLE;
  - the EntryThingy lane suspended;
  - Marketspread cancelled dates ignored;
  - Eventeny non-trading forms rejected.

  Tests passed: 87 plus 1 skipped on the Pi, and 88 in my workspace.
- Host tooling added:
  - `fpd-evidence` (a read-only evidence pack that aborts if the token appears);
  - `fpd-offsite-setup` and `fpd-offsite-backup` (rclone, kept 14 days, with `RESTORE.txt`). These are installed but no-ops until a remote is configured.
- Handed Codex the standalone Build 4 frontend package (`findpitches-v3-web`) plus handoff docs 00–08. Codex now serves it as the customer preview.

## Current work

- **21 Oct, check-in.** Read Codex's 16–20 Oct handovers and Chris's [20 Oct growth priority](../GROWTH_RECOVERY_PRIORITY_2026-10-20.md); acknowledged. Claimed, producer side only:
  1. **UK producer yield (growth priority).** Read-only measurement first: `uk-yield.sh` on the Pi reports, for GB, current/watch/held by source family, state and confidence; new-into-current vs left-current over 7/14/30 days from the feed history; why watch/held records are not current; 7-day crawl throughput per generator; and near-miss samples. A dated report with the actual numbers and a ranked list of UK organiser/trader-application source families follows. No paid discovery.
  2. **French producer corrections (V3-020, Codex's 18 Oct cases).** Angers region/start date, Plouarzel organiser "Google Docs", La Verpillière application window taken as event dates, Saint-Marcellin generic site title, Kilstett/Hochstatt LOW. Work starts from the stored source pages (read-only `fr-cases.sh` dump), not from memory. Fixes come with tests and the classifier-diff gate before any Pi install; refreshed records then go out through the normal ID/content-hash/last_checked contract. No relabelling or clock advance.
- **21 Oct, new hosts (BRIX), built but not running anything.** `fpd-prod` (J3455, BIOS updated F8→F13, 8 GB, SSD 100% life) and `fpd-standby` (J1900, BIOS F8 kept as Debian loads current microcode, 8 GB, SSD ~84% life). Both are Debian 13, patched, with memory limits enforced, a hardware watchdog and key logins. The `fpd-prod` clock battery is flat; a replacement is on order. **No producer jobs run on them.** Per the 20 Oct instruction, BRIX production waits for Chris's approval; the Pi remains the only producer.

- **15 Oct, France first night:** 1,774 organiser sites and 117 FR opportunities (33 usable, about 25 genuine on hand review). Kit `pi_kit_v3-011m` (`6bae1dcb…`: precision + France-crawl memory fix after the 15 Oct OOM) waits for the Pi gate. FR held.
- **15 Oct, France OOM root cause:** unbounded robots.txt read with the MemoryError swallowed; the Pi kernel has `cgroup_disable=memory`, so MemoryMax was never enforced. Fix kit `pi_kit_v3-011n` (`8c57bed3…`): 512 kB robots cap, MemoryError propagates and a crawl stops cleanly. France stays off (`FPD_FR_MINUTES=0`) and FR held until a supervised run under an enforced 450 MB limit passes.
- **15–16 Oct, Pi hardened:** the memory cgroup is enabled on the kernel command line; a UAS quirk for the data-SSD adapter (`usb-storage.quirks=7825:a2a4:u`) fixes the post-boot disconnect. The France crawl is back on and has run clean since 15 Oct ~19:45; FR export stays held until the 24 h soak is checked.
- **16 Oct, US farmers-market lane (`usda_fm:us`):** built from the USDA Local Food Portal directory (its API refuses automated clients; not bypassed). First night: 121 sites confirmed, 17 current records. Hand review found 5 wrong, which led to fix kit `pi_kit_v3-011r` (`856e181a`). Classifier-diff passed; the targeted re-assessment of 559 lane pages is done; the lane is resumed.
- **16 Oct, not-yet-open opportunities (Chris):** next-season rule plus the `fpd-v3-feed upcoming-on` switch. V3-027 has accepted the envelope; customer Save is V3-028.

- **14 Oct, France pack v1 + DATAtourisme lane: kit `pi_kit_v3-011l` (`88c0dcb8…`; builds `769bec3c`, `c6dfe9fd` withdrawn after Pi gate checks) **INSTALLED 14 Oct about 16:35 London** ([census + build](../../docs/findpitches-v3-france-census-2026-10-14.md)).
  - FR is added to the export enum, but records stay held until `sudo fpd-v3-feed fr-on` (Codex, V3-019).
  - The pre-install gate `classifier-diff.sh` (old vs new classifier on stored pages) runs before install.
  - Probe 5 calibration: about 5% of reachable organiser sites carry a current exhibitor route.

- **14 Oct, international acquisition directive acknowledged** ([directive](../PI_INTERNATIONAL_ACQUISITION_DIRECTIVE_2026-10-14.md)). The Pi is now the international acquisition factory; the KPI is net-new usable opportunities per country per week.
  - Effort split: US 40 / France 30 / other international 20 / maintenance 10.
  - Plan, in order:
    1. Country-pack format, with France as the first pack: vocabulary, French dates, addresses, departments/regions, route purposes, and original-language evidence kept.
    2. France source census.
    3. France pilot, large enough to rank source families.
    4. Delivery through the existing export path.
    5. France funnel and the path to 100.
    6. Persistent per-country arm scorecard and allocation for unattended running.
  - **Dependencies:**
    - (a) Codex: the export contract `country_code` enum is GB/US/CA/AU/NZ/IE. Adding FR is a contract change, and V3 ingest and verification must accept FR.
    - (b) Chris: OpenAgenda and DATAtourisme are open/public French event data, but both need a free API key. The directive says no API-key access without explicit authority.
  - Note for Codex: the official-calendar sample is **done**. It is in `e94ff7d`: 18 sites, 0 trader routes in calendar entries, no reader built. The midday status still lists it as next.

- **Kit 011k (`de249f09…`) prepared, 14 Oct:** a date-prefixed edition-title fix only. Measured on the Pi (read-only): it releases **7 US READY-eligible records** (6 OPEN_NOW, 1 ROLLING) and 11 US records to watch. 5 stay held on date conflict or bare date. Waiting for Chris to install while acquire is inactive.

- **Kit 011j (`2091be95…`) INSTALLED 14 Oct about 08:56 London** (D-018 route retention plus lane roll-over). Acquire was inactive at install; 105 tests passed; delivery restarted. The candidate switch remains OFF. **Measured after the 09:16 cycle:** current ENQUIRY records with no route went from 18 to **1**; **36** current records now carry a `trader_email` route.

- **14 Oct, alignment actions 3–6 done** ([doc, from "Structured-calendar sample"](../../docs/findpitches-v3-us-producer-sources-2026-10-14.md)).
  - Calendar sample: 18 US multi-event sites → 12 reachable under robots → 3 with a structured calendar (Tribe 2, ICS 3, JSON-LD 0) → 1 with future events (124 events, 15 titles, 2 trader-relevant opportunities) → 0 routes in the calendar → 0–1 expected net-new candidates.
  - **Calendar reader not built; no kit.**
  - Correction: coloradomarkets (whole site) and oldtownchicago (`/wp-json/`) disallow our user-agent, so neither counts as a Tribe route.
  - Loss-reason report tool `tools/loss_report.py`: read-only, counts only, eleven buckets, tested. The Pi run (`loss-report.sh`) is with Chris; numbers to follow.
  - The 78 candidates stay OFF pending Codex review.

- **14 Oct alignment report acknowledged** ([report](../ALIGNMENT_REPORT_2026-10-14.md)).
  - Correction: the line "Codex has not yet published a US scorecard" was written on 13 Oct, before `CODEX_US_SOURCE_SCORECARD.md` existed. It was left standing after the scorecard appeared; it has now been removed.
  - The 14 Oct assessment was based on the scorecard.
  - Working order: (1) seven-question checkpoint (below), (2) bounded structured-calendar sample with funnel, (3) producer loss-reason report, (4) build the calendar reader only if the sample shows value. The 78 candidates stay OFF pending Codex review.

- **14 Oct, US source handoff:** [assessment](../../docs/findpitches-v3-us-producer-sources-2026-10-14.md).
  - Eventeny's archive below id 37,000 is under 5% usable and is not a lever, which agrees with Codex.
  - The seven seeds are small or past.
  - ZAPP needs an API key (excluded); Renegade's 2026 applications are closed.
  - Proposal: a structured-calendar extractor (Tribe REST API + schema.org Event JSON-LD), with a bounded sample before any kit.
  - Kit `2091be95…` (D-018 retention plus lane-time roll-over) is ready for Chris, with a measured effect: 18 route-less ENQUIRY records gain routes; 78 candidates are available behind a switch.

- **13 Oct queue, items 1–2 (D-018), done on the producer side:** [review](../../docs/findpitches-v3-d018-producer-review-2026-10-13.md).
  - Found three discard points: trader emails dropped at export, contact instructions never stored, and watch/UNKNOWN records with routes never delivered.
  - Changes prepared and tested (105 tests): `trader_email` and `contact_instruction` routes are now retained; opt-in watch route candidates, default OFF.
  - **No kit yet.** Waiting on the measured Pi numbers (`d018-measure.sh`) and Codex's confirmation.

- **D-017 UK growth, producer side (acknowledged 2026-10-12 19:50).** [Pass 1 report](../../docs/findpitches-v3-uk-producer-pass-2026-10-12.md) answers all six of Codex's requirements.
  - Folk & Bespoke is behind a Cloudflare challenge, including `robots.txt`. A Pi custody pass (`uk-custody-kit.tgz`) is with Chris to run. If the Pi is also challenged, there is no legitimate automated route.
  - 16 Scotland/Wales/NI leads were checked: 1 strong (Verdant Works Food & Drinks, Dundee, 28–29 Nov 2026, open form), 1 conditional (Glasgow retail markets, standing registration), the rest closed or past.
  - The LocalStalls suffix fix has been installed since 11 Oct.
  - No paid queries.
- **D-017 pass 2 (kit `8b3d4368…`, INSTALLED 13 Oct; Verdant delivered to V3 as `current` OPEN_NOW, 28–29 Nov, at 05:50Z; prune fixed, `Result=success`):**
  - New `organiser_pages` seed kind, with Scotland/Wales/NI organiser seeds and the Craft NI hub.
  - Classifier no longer treats newsletter forms as application routes.
  - New `dundeeheritage` adapter. In a local end-to-end run, Verdant Works Food & Drinks exports as a correct OPEN_NOW record: 28–29 Nov, venue, on-page form.
- **Pi custody pass (21:20Z):** Folk & Bespoke, Abergavenny and Swansea all refused by `robots.txt` from the Pi too, so there is **no legitimate automated route** and no Folk & Bespoke adapter will be built. Asking the organiser directly is a human decision.
  - Host health is good: 0 rejected, 138 acks, 432 pending rechecks, source age 0 hours.
  - The alerting caught a real `fpd-v3-prune` failure. It is fixed in kit `126616ce…`, script only.
- **V3-001 DONE (12 Oct).** Codex's Nashville outcome, KEEP_BOTH_WITHHELD, is accepted.

- **18:21 London: producer/Pi launch condition met, GO.** The hotfix cycle succeeded: export at 16:46:49Z; delivery 2,112 accepted / 0 rejected, 332 rechecks acknowledged, source age 0 hours. Alerts are live. Under-voltage was seen during the cycle (`0x50005`), so the PSU swap is the top operator item. Kit `a58ad68a…` makes the power alert stick for 24 hours, to avoid flapping; install is optional.
- **Pi email alerts (Chris asked, 17:20; SMTP2GO):** kit `pi_kit_v3-011e` (`SHA256SUMS` `4b1e712f…`) = the 011d hotfix plus `fpd-alert-check` and `fpd-alert.timer` (every 15 minutes, read-only). It emails when a problem starts, reminds every 6 hours, emails when it clears, and sends a daily summary.
  - **What it watches:** discovery failure, delivery stalled (more than 45 minutes), rejected or failing, source more than 7 hours old, failed units, backups, under-voltage, temperature, disk, memory and reboots.
  - **Key custody:** the key is stored root-only in `/etc/fpd/alert.env`, is passed to curl on stdin, and is never logged or backed up.
  - **Tests:** 23 stubbed tests pass. The engine is unchanged from 011d.
  - **Scope:** this is operator alerting only, not customer alerts (V3-006 stays closed). It complements V3's C3 monitoring; it does not replace it, because a dead Pi can't email.
- **Launch support ([CLAUDE_LAUNCH_SUPPORT.md](../CLAUDE_LAUNCH_SUPPORT.md)), 17:30:** the [producer preflight](../../docs/findpitches-v3-producer-launch-preflight-2026-10-11.md) is CONDITIONAL-GO.
  - **The one producer condition:** hotfix kit `95c08051…` installed and a successful export cycle.
  - **The regression was mine.** Kit `b7c60c3a…` made `export full` fail validation from the 15:21 cycle onwards: `discovery_source` was `marketsireland`, which is not in the schema enum.
  - **Effect:** delivery stayed at 0 rejected, but freshness aged; the source was 4.4 hours old at 16:04Z.
  - **Fix:** the lane now uses `other` plus detail, with a regression test. 101 tests pass, and the fix was reproduced and verified locally.
  - **C1–C3:** C1 is closed (existing shadow ingest path); C2 is deferred until after launch; the C3 thresholds are in the preflight.
  - **Nashville:** custody evidence has been supplied to Codex.

- **Same-day launch review (ORDERS 15:18): producer/Pi area CONDITIONAL-GO.** See the [report](../../docs/findpitches-v3-launch-readiness-producer-2026-10-11.md). The conditions are C1 (confirm which ingest environment public V3 reads; the runner only allows shadow/test), C2 (fresh ingest-only token) and C3 (staleness alerts in launch monitoring). Nashville is not a blocker. Nothing was installed or changed for launch.


- **V3-001 (installed, finishing):** the paging kit was installed about 12:26 London.
  - First delivery: `pending_rechecks` 1,390 (all pages), 2,044 accepted / 0 rejected, 16 acks.
  - Codex's cloud check of the first feed: 119/119 EXACT_MATCH, 113 advanced, 0 customer-visible, 6 equal-clock conflicts held. See the [lifecycle checkpoint](../../docs/findpitches-v3-lifecycle-cloud-checkpoint-2026-10-10.md).
  - Left to do: record the first discovery cycle on the new handoff; get fresh refetches for the 6 conflicts (needs V3 recheck requests for those entities).
- **V3-002 (evidence published; option B prepared, held):**
  - Root cause and holdings: [UKCraftFairs access note](../../docs/findpitches-v3-ukcraftfairs-access-2026-10-10.md).
  - Option B path: [proposal](../../docs/findpitches-v3-producer-source-documents-proposal.md). Producer code is built and tested (90 Python + 6 runner tests) but off: no config key is set, and it is not wired into `fpd-cycle`.
  - Waiting on: Chris (A and/or B; enquiry policy) and Codex (endpoint).
- **Following [ORDERS.md](../ORDERS.md) (12:40):** V3-001 first. Next evidence is the 15:10 discovery cycle, the first on the new handoff.
- Acknowledged: Codex owns V3-004 and V3-005 (V3-005 blocked on browser trust); ChatGPT owns V3-010.

## Evidence and commits

- Producer source custody: `producer/fp-discovery-lab/` with `producer/SOURCE_SHA256SUMS` (81 files) and a [custody README](../../producer/README.md).
- Handoff docs 00–08 were supplied to Codex outside GitHub (handover ZIP). Cloud side of the feed: [Codex feed confirmation](../../docs/findpitches-v3-producer-feed-confirmation-2026-10-09.md).

**Deployment version and environment:** the producer runs on the Pi only (`fpd-pi`, systemd). The audit-fix kit was installed on 10 Oct. **Nothing was deployed to Cloudflare by me.**

## Checks performed

- Unit and integration suite (88 in my workspace; 87 plus 1 skipped on the Pi).
- Read-only `fpd-status` output supplied by Chris.

**Not performed:** I have not seen the post-install rebuild results, and I have not run a planned reboot test.

## Metrics: Pi `fpd-status`, about 2026-10-10T10:24+01:00, run by Chris

| Item | Value |
| --- | --- |
| Current records | 1,925 |
| Watch records | 1,871 |
| Last delivery | 1,925 accepted, 0 rejected |
| Recheck handling (last cycle) | 63 already fresh, 35 queued, 2 with no known URL |
| Feed lifecycle records | 119 (built, **not delivered** while the feed is off) |
| Power | `throttled=0x50005` (live under-voltage). Chris is replacing the PSU. |
| Off-site backup | Not configured |

**Correction:** my earlier "337 rechecks acknowledged in 20 h" came from the Pi's own delivery log, not V3's ledger. Codex's ledger figures supersede it. Don't add the two together.

## Blockers and dependencies

- Feed enable needs Chris to run `sudo fpd-v3-feed enable` on the Pi.
- UKCF access policy: V3 needs to decide whether to accept Pi-retained evidence or find another legitimate route.
- PSU replacement.
- Off-site backup remote (S1).

**Next action and owner:** Claude does the recheck-runner cursor upgrade (V3-001) and the UKCF evidence sample (V3-002). Chris enables the feed.

**Approval required:** none outstanding for my tasks (D-011 granted the source commit). No publication, cutover or billing gate has been reached.

**Paid queries, messages, publication or production changes made:** none. No Serper calls, no emails, no Stripe or Cloudflare changes, and V2 untouched.

**Source mutations, identity changes or leakage:** none by me. The token is not in any file, log or update I produced.
