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
