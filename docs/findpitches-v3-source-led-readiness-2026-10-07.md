# Source-led commercial pilot — 7 October 2026

The source-led trial used **12 paid queries and 12 observed credits**, produced **four qualified new READY opportunities**, and increased shadow inventory from **450 to 454 READY**. Paid acquisition is paused. Publication and production cutover remain disabled. V2 was neither read nor modified during this work.

## Commercial outcome

| Measure | Final result |
|---|---:|
| Queries / observed credits used by this trial | **12 / 12** |
| Total V3 paid queries / observed credits today, London calendar | **24 / 24** |
| Candidate occurrences / distinct candidate URLs | **70 / 70** |
| Distinct linked entities / genuinely new entity IDs | **7 / 7** |
| Source-verified entities / qualified READY gained | **4 / 4** |
| WATCH entities / quarantined or blocked canonical entities | **3 / 0** |
| Duplicate candidate occurrences | **15 / 70 — 21.43%** |
| WATCH/quarantine/unsupported/out-of-market candidate occurrences | **44 / 70 — 62.86%** |
| Excluded candidate occurrences | **7 / 70 — 10%** |
| READY per 100 queries | **33.33** |
| Queries / observed credits per qualified READY | **3 / 3** |
| Monetary cost per READY | **Unavailable: credit unit price is not configured** |
| Pending candidate verification / due core jobs | **0 / 0** |
| Destructive source mutations / identity changes | **0 / 0** |
| Customer / publication leakage | **0 / 0** |

Candidate dispositions reconcile exactly: **4 READY + 15 duplicates + 7 excluded + 44 held = 70**. The 44 held candidates comprise three WATCH entities, 24 unverified discoveries, eight out-of-market discoveries, four quarantined discoveries and five unsupported PDFs. A held discovery without defensible source country/edition does not acquire a fabricated canonical identity. Three WATCH entities cover unknown availability, nonprofit-only admission and active-Chamber-member admission. The duplicate rate includes already-known routes and repeated discovery URLs, whereas all seven newly linked canonical entities have distinct IDs.

| Target market | Queries | Candidates | Qualified READY gained | READY per 100 queries |
|---|---:|---:|---:|---:|
| GB | 3 | 11 | 0 | 0 |
| CA | 3 | 23 | 0 | 0 |
| AU | 2 | 20 | **1** | 50 |
| NZ | 2 | 5 | 0 | 0 |
| US | 2 | 11 | **3** | 150 |
| Total | **12** | **70** | **4** | **33.33** |

US received **16.67% of queries**, and produced 75% of qualified READY. AU produced the remaining 25%. Country quotas prevented acquisition from becoming US-only, but this small sample provides no positive READY result for GB, CA or NZ. A rate above 100 READY/100 queries is possible when one query returns several qualifying applications; these rates are observed sample outcomes rather than projections.

READY gained by actual proof family: **Eventeny 3; LocalStalls 1**. Official organiser, municipal, external form and PDF discoveries gained zero READY.

| Reviewed query family | Queries / credits | Candidates | Entities created | Verified / READY | Queries per READY |
|---|---:|---:|---:|---:|---:|
| LocalStalls | 3 / 3 | 11 | 1 | 1 / 1 | 3 |
| Eventeny | 2 / 2 | 20 | 6 | 3 / 3 | 0.67 |
| Official organiser | 5 / 5 | 26 | 0 | 0 / 0 | Undefined |
| Municipal | 2 / 2 | 13 | 0 | 0 / 0 | Undefined |

The query-family table charges each query to its reviewed search pattern, including unsuccessful or out-of-market results. Actual discovered source family is separate. No candidate count is used to declare success.

## Quality finding and stop

The initial policy claimed five READY records. Practical inspection found that one Delray application explicitly required an **active Chamber member**. That route is open, but general trader eligibility was unsupported. The trial was paused by supervised quality review with recorded reason **`restricted_application_false_promotion`**. It was not allowed to consume the remaining query headroom.

Application policy **v1.2** now holds membership-only/invitation-only/returning-vendor-only routes, retains the exact application heading/audience, and rejects such restrictions in official inline forms. A fresh direct-source verification makes the Chamber application **WATCH**. Original facts, document/proof history, canonical identity and the earlier READY history remain intact. Current commercial metrics exclude the unsupported claim. The four other paid READY records passed practical review; one is a source-confirmed ongoing operator food-vendor programme with a past start and a future end, and its dates were preserved.

The automatic false-promotion guard evaluates the immutable READY/proof history and returns **`false_ready_promotion_detected`** for this historical claim. A regression test proves that condition automatically latches paid acquisition off before another query. The live initial stop was supervised review; the guard was added and verified afterwards. There are **zero remaining false READY claims in the paid sample**, and the original 450 READY records are unaffected by this rule.

One GB query used the incorrect LocalStalls `/gb/event/` path and returned nothing. Corpus inspection identified `/uk/event/`; future plans are corrected. The original query/credit remains counted and was not rerun. This limits what the GB result can establish. Eight results from a Canada-targeted query proved another country and were withheld from canonical ingestion, demonstrating that query targeting cannot become source geography.

## Controls and deployed state

The programme has a persistent **25-query/conservative-credit daily limit across all V3 paid lanes**, counting the earlier 12 V3 queries today. The global **4/run, 100/hour, 1,000/day** limits remain. Each new run grants one reviewed query; five slots per country are shared across sessions. Reservations are atomic, a database guard independently enforces the lower cap, unknown billing outcomes cannot be rebilled, and a latched quality pause survives another programme start.

Stops cover zero READY after ten settled queries, READY/query below 0.1, duplicate/source-mix spikes, queue growth, provider uncertainty, integrity/leakage, a detected false promotion, budget thresholds and expiry. The old city-pilot start route is retired. No paid scheduler or bulk lane is enabled. Visible policy, usage, country/source yield, retained history and stop state are available at `/status.source_led_programme`; commercial inventory is authoritative at `/status.commercial`.

All eight owned V3 shadow workers are deployed with the correction, and additive migration 0013 is applied to the owned shadow D1 database. A transient Cloudflare 503 interrupted one deployment before upload; the owned-worker retry succeeded. Already-paid pending candidates were finished through direct source fetches after the pause, using **zero additional Serper**.

The custody audit checked **8,305 original receipts, 63,824 original source fields and 5,565 pre-existing entity identities**: zero modifications/deletions or identity changes. New receipts/facts were additive. The full V3 suite passed **114 tests**, including native workerd/D1/queue integration, the 100-row preservation control, concurrent budget reservation, replay uncertainty, target/source country separation, restricted audience proof and automatic pausing. Boundary checks passed; no V2 infrastructure/data, production route, publication resource or protected branch was changed.

The free structured producer remains primary. Its 15-minute cloud delivery path remains available, but the **Raspberry Pi host is not live** and authenticated host contact remains absent. Structured reconciliation takes priority over admitting a paid grant. No producer-host setup is claimed by this report.

## Exact current inventory and recommendation

The final commercial total is **454 READY**: Claude structured **441**, legacy recovery **9**, source-led paid **4**, old city/Serper **0**. READY by country: **US 446, AU 4, GB 2, NZ 2, CA 0**. READY by platform/domain: **Eventeny 446, LocalStalls 8**. All are shadow-only.

**Keep paid acquisition paused now: recommended effective daily paid allowance 0, retained hard commercial cap 25.** This trial establishes that source-led paid discovery can produce READY, including a non-US opportunity, but the audience failure and zero GB/CA/NZ conversion do not justify an increase. The next highest-value paid-lane task is a free direct-source audit of corrected audience rules and the strongest non-US organiser/application sources from this dataset, followed by source-specific adapters and a small clean holdout. After that evidence passes, another operator-run country-balanced trial should stay at **25/day**, with no continuous bulk acquisition.

The [machine-readable audit](../operations/findpitches-v3/reports/source-led-pilot-2026-10-07.json) includes current per-run telemetry, the exact source/country breakdown, held-candidate reasons, public application headings, custody results and historical policy snapshots. [Programme operations](findpitches-v3-source-led-programme.md) describes the admission and pause controls.
