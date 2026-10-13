# D-017 producer pass 1 (Claude): Folk & Bespoke custody, Scotland/Wales/NI leads

- **Author:** Claude
- **Date:** 2026-10-12, about 19:45 London
- **Answers:** [Codex's producer requirements](../team/CLAUDE_UK_GROWTH_REQUIREMENTS.md)
- **Machine-readable leads:** [uk-regional-leads-claude-2026-10-12.json](../operations/findpitches-v3/reports/uk-regional-leads-claude-2026-10-12.json)
- **Spend:** none. No paid queries and no Serper use. The research web searches were made from Claude's own tooling and did not use FindPitches credits.

## Summary

| Requirement | Status |
| --- | --- |
| 1. Folk & Bespoke fresh custody | **Pending: a Pi custody pass has been prepared for Chris to run.** Folk & Bespoke serves a Cloudflare *challenge* on every URL, `robots.txt` included, both to Claude's workspace and to V3's cloud. The producer treats a 401/403 `robots.txt` as "disallow all". It will not solve challenges or impersonate a browser. The Pi run shows whether its residential IP gets real pages. If it is also challenged, **there is no legitimate automated route**, and the remaining option is to ask Folk & Bespoke directly (Chris's decision). |
| 2. Scotland, Wales and NI operator-first leads | **16 leads checked; 1 strong, 1 conditional, the rest closed or past** (table below). The Christmas 2026 calls in these nations mostly closed in August–October. The honest near-term upside is small. Spring 2027 calls normally open from January. |
| 3. Evidence fields | Each lead records the exact event, organiser, venue, dates, state as read, URL, time fetched, HTTP status and sha256. These are **leads, not proof**: the pages were fetched from Claude's workspace, not the Pi. V3 should fetch directly wherever it can. |
| 4. LocalStalls organiser suffix (`One-off / Irregular`) | **Done and installed.** Organiser now comes from the Event JSON-LD organiser or the "By …" line, with frequency labels removed, plus explicit-year JSON-LD dates. The fix shipped in kit `b7c60c3a…` (11 Oct) and is still present in installed kit `0748f4e3…`. It is an additive refresh: original raw custody and ids are unchanged, and no rolling or season dates are advanced. Five sanitised AU fixtures are in `tests/fixtures/`. |
| 5. Delivery and health | The Pi custody pass also captures a timestamped `fpd-status`, which will be reported once Chris runs it. Email alerts are live, with quiet hours 22:00–07:00. The PSU swap is still pending. |
| 6. Paid searches on the Pi | None run, and none planned without a central Codex grant. |

## Scotland, Wales and NI leads (fetched 2026-10-12 about 18:33–18:45Z)

| Nation | Event | State as read | Disposition |
| --- | --- | --- | --- |
| SCO | **Verdant Works Christmas Market: Food & Drinks**, Dundee Heritage Trust, Verdant Works Museum, **28–29 Nov 2026** | **Open**: on-page stallholder form for food and drink producers | **Strongest lead**: explicit year and dates, named venue, open trader form on the organiser's own page |
| SCO | Verdant Works Christmas Market: Art, Craft & Design, 21–22 Nov 2026 | Full (according to the food page) | Hold |
| SCO | Glasgow retail markets (Bridgeton Cross Tue/Fri; Partick Mansfield Park Wed), City Property (Glasgow) LLP | Standing trader registration scheme; stalls from £28 | Conditional: needs V3's rolling/enquiry policy; no dated occurrence |
| SCO | Curated In The Square, Aberdeen | Article from 2025; closed 6 Oct 2025 | Exclude |
| NI | St George's Market, Belfast: new traders | "Not accepting applications for new traders" | Hold |
| NI | Christmas Twilight Market, St George's | 2025 call (deadline 10 Oct 2025) | Exclude; no 2026 call on this route yet |
| NI | Guildhall Craft Fair 2026, Derry | Closed 5 Aug 2026 | Hold |
| NI | Flowerfield Christmas Craft Market, 14 Nov–23 Dec 2026 | Closed 21 Sep 2026 | Hold |
| NI | ABC borough-wide Artisan Markets 2026 | Email-only route (address protected) | Does not meet D-012's https route; needs the council's dated list |
| NI | Newry, Mourne & Down Artisan Markets 2026 | Window 9–31 Mar 2026 closed | Hold; 2027 call expected early in the year |
| NI | Belfast International Arts Festival vendors | Closed 7 Oct 2026 | Exclude |
| WAL | St Fagans Food Festival, 12–13 Sep 2026 | Closed 20 Mar; a 2027 interest list only | Exclude |
| WAL | Christmas Craft Fair, Tŷ Pawb, Wrexham | Past (1 Dec 2024) | Exclude |
| WAL | Abergavenny Food Festival trader information 2026 | Cloudflare 403 to the workspace | In the Pi pass |
| WAL | Swansea Market casual trading | `robots.txt` behind a Cloudflare challenge | In the Pi pass |
| ENG | Folk & Bespoke | Cloudflare challenge on every URL | In the Pi pass |

Not counted as gains: none of these is V3 READY until V3 verifies it. Several organisers publish calls in a predictable window: NMD and St Fagans in March, Flowerfield and Derry in August. That makes a dated **"call calendar" watch** a cheap way to catch 2027 openings.

## The tool

`producer/fp-discovery-lab/tools/custody_fetch.py` is a bounded fetch-once tool.

**What it uses:** the producer's own fetcher, so robots.txt, user-agent and per-host delay match the producer.

**Limits:**
- depth 2 at most, and 5 children per page;
- an overall fetch cap;
- social, ticketing and login URLs are never fetched;
- no retries.

**What it keeps:**
- exact response bytes, as `docs/<sha256>.bin`;
- a custody row for every request, including failures and robots refusals (`manifest.jsonl`).

It neither reads nor writes the producer database. It is source custody only; nothing is wired into `fpd-cycle`.

## Pi custody pass result (2026-10-12T21:20:51Z, run by Chris)

**The result:** every request was refused by `robots.txt` from the Pi as well.

| Host | Requests | Result |
| --- | --- | --- |
| folkandbespoke.com (home page plus 3 sitemap candidates) | 4 | `robots_disallowed` |
| abergavennyfoodfestival.com | 1 | `robots_disallowed` |
| swansea.gov.uk | 1 | `robots_disallowed` |

**What this means:**
- **The producer fetched 0 pages.** It saved no documents and solved no challenges.
- **The cause:** the robots file was refused (401/403, Cloudflare) or explicitly disallows the agent. The producer treats either as "do not fetch".
- **Conclusion:** there is **no legitimate automated route** to Folk & Bespoke, Abergavenny or Swansea from the producer. This is not a Pi-versus-cloud difference.
- **The only proper next step is human:** ask the organiser for permission (an allowlisted bot) or a feed. That is Chris's and Codex's call; no message has been sent.
- **Until then**, the 16 historic Folk & Bespoke routes stay leads only. I am not building a Folk & Bespoke adapter.

**Host health at 21:20:52Z** (from `fpd-status`, captured by the same run):
- **Discovery:** cycle at 21:24 London `success`; export `2026-10-12T204450Z`, 1,807 actionable, no stalled sources.
- **Delivery:** at 21:05:39Z, 2,125 accepted, **0 rejected**, 306 inserted, **138 rechecks acknowledged**, pending rechecks **432** (579 at Codex's 17:14Z observation), source age 0 hours.
- **Backups:** local `20261012T0320Z`, off-site ok at 04:55:54Z.
- **Power:** `throttled=0x50005`, under-voltage live; the PSU swap is still pending.

**New defect found by the alerting:** `fpd-v3-prune` had been failing. Under `set -o pipefail`, the checkpoint loop ended with a false `[[ ]] &&` test once more than 20 recent checkpoints existed (an empty glob would also have failed).
- **Effect:** limited. Old delivery checkpoints and temp files were not being cleaned up; delivery itself was not affected.
- **Fix:** script only, in kit `126616ce…` (`pi_kit_v3-011h`), with 3 regression tests (`deploy/pi-tests/prune.test.sh`). The engine is unchanged.

## Pass 2: Scotland/Wales/NI producer lanes (kit `8b3d4368…`, `pi_kit_v3-011i`; supersedes `126616ce…`)

**New seed kind: `organiser_pages`.**
- Named council, venue and festival trader-call pages are queued as ordinary **candidate pages on organiser sites**. They are not treated as hubs, so an open call on the page itself can become a record.
- Directory seeds force a hub role on the whole domain, which would have stopped this.
- Lane: `organiser:<name>`, exported as `discovery_source: organiser_site`.
- New command: `fpd seed organisers`. It runs in the normal cycle through `seed curated`, once per seed group.

**The seeds:**

| Type | Pages |
| --- | --- |
| Organiser pages | Dundee Heritage Trust (Verdant Works markets); City Property Glasgow (retail and farmers' markets); NI council calls (Newry, Mourne & Down artisan markets, Derry Guildhall Craft Fair, St George's Market traders); St Fagans Food Festival |
| Hub, follow-limited | Craft NI makers' opportunities board, following only links whose slug mentions vendor, trader, stall, market, fair or Christmas |

The Armagh, Banbridge & Craigavon (ABC) news page was **left out**: the generic extractor took today's date from it as an event date, and its route is email-only.

**Two correctness fixes found while testing on a copy of the producer database:**

| Fix | What changed |
| --- | --- |
| Classifier | **Newsletter and mailing-list forms are never application routes.** Mailchimp and similar senders, or fields such as newsletter, subscribe or special offers, are excluded. On the Verdant page the Mailchimp sign-up had been taken as the route, and was the only reason the page looked open. In the earlier local sample, 0 existing actionable records relied on such a route. |
| `dundeeheritage` adapter | The event's dates are **the header line under the H1 only**. The Food & Drinks page also mentions the 21–22 Nov craft market, which the generic extractor had taken. The venue tag above the title is used as stated text (no locality inference). The open state comes only from the explicit on-page call, "…food or drinks producer… stallholder… please fill in this form…", with the form posting to the same page. After the event, it is not open. |

**End-to-end result (local copy of the producer database, export and validation pass):**

| Record | Channel and state | Details |
| --- | --- | --- |
| **Verdant Works Christmas Market: Food & Drinks** | `current`, **OPEN_NOW** | 2026-11-28 to 2026-11-29 (`organiser_event_header`); organiser Dundee Heritage Trust; venue Verdant Works Museum; application on the event page |
| Farmers Markets in Glasgow | `current`, ENQUIRY_AVAILABLE | No https application route; V3's D-012 check decides |
| Newry, Mourne & Down artisan markets | `watch`, CLOSED_CURRENT_CYCLE | Its "application URL" is the council's generic `/apply` page; V3 should not treat it as proof |
| Glasgow retail markets | `watch`, UNKNOWN | |
| St George's traders | `held`, UNKNOWN | |
| Verdant craft page | rejected | "currently full" |
| Derry | rejected | |
| St Fagans | rejected | |

**Tests and changes:**
- 103 Python tests pass. New: Verdant fixture (sanitised), organiser-seed behaviour, newsletter exclusion via the Verdant assertions.
- Pi tests: alerts 34, prune 3.
- Engine changes are limited to `adapters.py`, `classify.py`, `cli.py`, `generators/seeds.py`, `integration/records.py` and `seeds.json`.
- Identity, lifecycle and export rules are unchanged.

## Pass 2 on the Pi: installed and delivered (2026-10-13, observed about 07:00 London)

Kit `8b3d4368…` was installed by Chris. Observations are from `fpd-status` and a `jq` read of the feed.

| Check | Result |
| --- | --- |
| Discovery | Cycle at 06:16 London: `success`. Export `2026-10-13T053848Z`, 1,797 current, no stalled sources. |
| Delivery | At 05:50:02Z: 2,128 accepted, **0 rejected**, 309 inserted, 194 rechecks acknowledged, pending rechecks 372, source age 0 hours. |
| Prune | `fpd-v3-prune` manual run after install: **`Result=success`**. The fix works on the real state directory. |
| Power | `throttled=0x50000` at the time of the check (no live under-voltage); the PSU swap is still pending. |

**Organiser-lane records in the delivered feed** (`discovery_source: organiser_site`):

| Channel and state | Event | Dates |
| --- | --- | --- |
| `current` **OPEN_NOW** | **Verdant Works Christmas Market: Food & Drinks** | 2026-11-28 to 2026-11-29 |
| `current` ENQUIRY_AVAILABLE | Farmers Markets in Glasgow | (none stated) |

The other organiser seeds (Newry, Mourne & Down; St George's; Glasgow retail; Derry; St Fagans) produced watch, held or rejected outcomes, and are not in the delivered feed.

**Codex:** the Verdant record is now in V3's shadow ingest as producer evidence. Please verify it directly from the organiser page. It is a candidate for Scotland's first proved customer-ready listing. It is not counted as a gain until V3 verifies it.

