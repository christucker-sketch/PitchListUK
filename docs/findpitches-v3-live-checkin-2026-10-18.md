# FindPitches live check-in — 18 October 2026

Fresh observations at **15:30–15:33 London**. The public service is responding normally; inventory renewal and proof conversion need attention. This was a read-only check, with no deployment, acquisition or source repair.

[Aggregate runtime evidence](../operations/findpitches-v3/reports/live-checkin-2026-10-18.json).

## Commercial inventory

At **15:30:37 London**, the current customer catalogue contains **1,701 READY** application opportunities:

| Country | READY | Net change since 17 October 00:27 London |
| --- | ---: | ---: |
| US | 1,532 | -74 |
| GB | 159 | -2 |
| NZ | 5 | 0 |
| AU | 4 | 0 |
| CA | 1 | 0 |
| FR / IE / SG / HK | 0 | 0 |
| **Total** | **1,701** | **-76 (-4.3%)** |

These are distinct customer-eligible application opportunities, not counts of unique festivals. The difference is a net snapshot change; gross additions/removals and the cause of each withdrawal were **not** reconstructed in this check. Do not describe all 76 as expired, deleted, or lost because of a deployment. Record-level withdrawal/renewal attribution remains necessary.

## Frontend and billing

- Homepage, health, global home data, UK catalogue and plans returned HTTP 200. Individual observations: homepage **0.554s**, UK catalogue **0.499s**, global home data **1.324s**. These are single HTTP observations, not a new browser benchmark or latency distribution.
- Native production bindings confirm public access, LIVE Checkout and account recovery enabled. Existing email, Stripe and webhook secret bindings are present; no secret values were read or exported.
- **Zero pending billing webhooks.** No new customer, email, Checkout, charge or cancellation was created to check status. The earlier owned LIVE acceptance remains the functional baseline; this check does not repeat it.
- The last full runtime suite remains the **519-test** checkpoint of 17 October. No runtime code changed or full suite was rerun today. The remaining global performance follow-up stays open.

## Producer and French intake

The Pi is contacting V3 on cadence: latest authenticated poll **15:18:58 London**, recent intervals approximately **15.4 minutes**. Latest new receipt **12:44:48 London**, latest aggregate source check **12:34:24 London**; the four-hour aggregate freshness warning is off. This does not extend individual proof expiry.

Pending producer rechecks are now **912**, up from **404** at the earlier 17 October 00:12 checkpoint. Country breakdown: US660 / GB111 / AU103 / NZ15 / CA12 / FR8 / IE3. There were **2,186 acknowledgements in the preceding 24 hours**, but **zero currently pending requests have fresh linked evidence eligible for acknowledgement**. An acknowledgement is not READY proof. Claude/producer owns refreshed source evidence; do not clear requests using an unchanged replay.

**France is no longer waiting for its first delivery.** There are **29 accepted producer IDs linked to 29 commercial entities**, across 93 immutable receipt versions. Latest units: **29 accepted / 0 rejected**. First French receipt was **17 October 00:56 London**; two test entities remain excluded. **French customer READY remains zero.**

Current French proof profiles are all generic: 20 unverified, 9 quarantine. All 29 lack application proof. Dominant overlapping reasons include missing single-event structured source data14, platform/index content6, missing event content scope5, editorial content2, one HTTP403 and identity/content conflicts. These flags overlap and must not be added as mutually exclusive totals. There is no evidence of a transport rejection problem. Next work is source-specific French organiser/council/form/PDF verification against the delivered corpus, without guessing facts or weakening gates.

## Storage: actual 48/72-hour verdict

The elapsed-time dependency is complete: **312 native samples across 77.75 hours**, from 15 October 09:45 to 18 October 15:30 London. Current source/evidence D1 is **4,404,322,304 bytes / 44.04%**, with **5.596 GB** remaining against the conservative 10 GB cap. The separate customer database is excluded.

| Actual window | Physical net growth | Average per day |
| --- | ---: | ---: |
| First 48 hours | 446.18 MB | 223.09 MB |
| First 72 hours | 646.03 MB | 215.34 MB |
| Full 77.75 hours | 680.46 MB | 210.05 MB |

Excluding whole intervals around the three declared migration changes leaves **76.25 hours / 645.26 MB / 203.10 MB per day**. The change windows total20.734MB but also include background activity; they were not simply subtracted from raw growth.

Full logical payload comparison against 16 October is included in the evidence. Source facts added66,440 rows /110.91MB; producer receipts5,678 /38.96MB; verification history16,339 /58.55MB; jobs73,700 /19.64MB; source documents16,573 /12.25MB. These are logical TEXT/BLOB deltas over their own dated baseline intervals, not physical table/index attribution or pure organic growth. Original source evidence remains retained.

**Verdict:** D1+R2 remains operationally acceptable at the present capacity; no emergency migration or acquisition stop is required by capacity today. Continuing ~200MB/day hot growth is not a sustainable basis for unrestricted expansion. At the full-window raw rate, the 70% warning is approximately **12.4 days** away and the 97% protective stop **25.2 days** away. These are linear scenarios, not forecasts. Existing70/80/90/97% thresholds stay unchanged. Prioritise a reviewed design for reducing repeated fact/provenance storage and renewal overhead before increasing volume; do not delete originals or start PostgreSQL/sharding without the separate authority required by the storage order.

V3-022's timed measurement/verdict is complete. Capacity monitoring and the storage-efficiency follow-up remain ongoing operational work.

## Safety and next order

Core reconciliation/eligibility/enrichment/readiness jobs: **zero due, leased, dead or stale** at the observation. This is distinct from the 912 producer rechecks.

V3 paid acquisition remains manually paused, bulk disabled, with **no V3 Serper usage rows on 16–18 October**. This is not an account-wide audit of other clients. The unused source publication pipeline remains off, with zero customer projection/publication queue rows; the separately authorized public customer service remains on. No source facts, identities, V2 or PitchList were changed; no fresh global historical custody audit is claimed.

Ordered resume: billing DONE; measured performance checkpoint stable with global follow-up OPEN; storage timed verdict DONE; **French proof ACTIVE against real delivered records**; upcoming/Save DEFERRED. Attribute the current inventory withdrawals and coordinate the growing producer recheck backlog alongside proof work. Keep paid acquisition paused. No runtime change was made during this status check.
