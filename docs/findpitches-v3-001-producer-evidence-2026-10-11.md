# V3-001: producer-side evidence for the six conflict items

- **Author:** Claude
- **As of:** 2026-10-11T11:20:45Z
- **Source:** read-only scripts run on fpd-pi by Chris. No secrets were printed, no source data was changed and no paid queries were made.
- **Machine-readable copy:** [findpitches-v3-001-producer-evidence-2026-10-11.json](findpitches-v3-001-producer-evidence-2026-10-11.json)
- **Cloud verification:** Codex's [lifecycle final cloud report](findpitches-v3-lifecycle-final-cloud-2026-10-10.md)

## 1. Every handed-over request was examined

The Pi now reads every page of V3's recheck requests. Each discovery cycle examines every request. At most 300 pages are re-queued per cycle; the rest are reported as `deferred` and picked up oldest-first in later cycles.

| Cycle start (UTC) | Requests | Queued | Deferred | Already fresh | No URL | Sum |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-10-10 14:15:26 | 1,382 | 300 | 1,020 | 3 | 59 | 1,382 |
| 2026-10-10 17:17:42 (provenance-URL fix installed) | 1,336 | 300 | 1,036 | 0 | **0** | 1,336 |

Pending rechecks at V3, as reported by the runner:

| Time (UTC) | Pending |
| --- | --- |
| 10 Oct 11:26 | 1,390 |
| 10 Oct 16:31 | 1,315 |
| 10 Oct 17:36 | 1,380 |
| **11 Oct 11:20** | **320** |

The latest delivery, at 2026-10-11T11:20:45Z, sent 2,096 records: 2,096 accepted, 0 rejected.

## 2. The three genuinely refreshed items (verified by Codex)

These were refetched through the normal path, with Codex's six exact requests queued using their original `requested_at`.

| Producer id | V3 entity | requested_at | Previous source check | New source check | Producer state | Acknowledgement |
| --- | --- | --- | --- | --- | --- | --- |
| `fdx1_4d4590cdbd191713c317` | `ent_980b3f71…` | 2026-10-09T13:33:34.663Z | 2026-10-04T16:10:45Z | **2026-10-10T17:37:14Z** | retired / HISTORICAL | acknowledged |
| `fdx1_58df50276bd7933d3ade` | `ent_aab98ac5…` | 2026-10-09T13:32:36.818Z | 2026-10-04T16:51:54Z | **2026-10-10T17:37:21Z** | watch / HISTORICAL | acknowledged |
| `fdx1_8ba38ecf08fb5cc324d9` | `ent_bca3cd60…` | 2026-10-09T13:33:18.601Z | 2026-10-04T16:45:58Z | **2026-10-10T17:37:26Z** | watch / CLOSED_CURRENT_CYCLE | acknowledged |

Source pages for these three:
- **Fiesta (`4d4590`):** `fiestasanantonio.org/fiesta-san-antonio-vendor`.
- **626 Night Market (`58df50`):** `626nightmarket.com/join-us`, plus 2 corroborating pages.
- **Queen Victoria Market (`8ba38e`):** `qvm.com.au/become-a-trader`, plus 2 more pages.

All three requests are absent from V3's poll at 2026-10-11T11:20:37Z, which means they were acknowledged. Codex's ledger independently shows:
- 3/3 fresh receipts;
- 3/3 links to the same entity;
- 3/3 CLOSED selected on the newer clock;
- 3/3 acknowledged under their original tokens at 18:14:29Z.

**Retained end-to-end trace (Fiesta, `4d4590`):**

1. **Producer:** state change to HISTORICAL from a genuine fetch at 17:37:14Z.
2. **Delivery:** included in the lifecycle feed.
3. **V3 identity:** receipt linked to the existing entity `ent_980b3f71…`.
4. **V3 state:** CLOSED selected.
5. **Acknowledgement:** under the original token.
6. **Customer view:** withheld from the preview.

## 3. The three items that cannot refresh under their old id

None of these ids is produced any more, so no newer evidence can ever be delivered under them. V3 keeps receiving the frozen last record through the lifecycle feed's 45-day window. Their requests are still pending, and the producer cannot acknowledge them.

### `fdx1_86aaebe1504fa56df8c0`: "Pop Up Shops", UKCraftFairs 26684 (past, not relevant)

| Fact | Value |
| --- | --- |
| V3 entity | `ent_610f9171…` |
| requested_at | 2026-10-09T13:33:05.718Z |
| Engine opportunity | 3257: `state=NOT_RELEVANT`, `relevance=not_relevant`. Dates 2026-10-01 to 2026-10-06 (ended). Evidence: "Not a trader opportunity (classifier label: rejected)". |
| Page assessments | 2026-10-08 19:39:44 UTC and **2026-10-10 17:35:36 UTC**, both `rejected` with `no_vendor_signal` (rules-v4-states). The second is the targeted refetch. |
| Why it disappeared | The export includes only relevant opportunities. Its last delivered record (retired / CLOSED, exported 2026-10-08) is not carried forward, because its last channel was already `retired`. |
| Correct V3 outcome | CLOSED and withheld, which is already the case. The request is obsolete and needs an audited resolution on the V3 side. |

### `fdx1_9b04c3e4d51b66bbcfab`: From the Ground Farmers Markets, Marketspread 26215 (identity replaced)

| Fact | Value |
| --- | --- |
| V3 entity | `ent_fe98b225…` |
| requested_at | 2026-10-09T19:03:18.609Z |
| Old identity | Natural key `US\|site:marketspread.com:from ground farmers markets\|2026`. Single anchor: the Marketspread apply URL. Exported up to 2026-10-09T09:49Z. |
| Engine now | Opportunity 3291 is relevant and was assessed OPEN_NOW at **2026-10-10T17:37:06Z** (the targeted refetch). The current code extracts the platform id `marketspread_market:26215` from the same URL, so the natural key becomes `…\|marketspread:26215\|…` and a different producer id is minted. The old record had only the URL anchor; one shared URL anchor is deliberately not enough to keep an id. |
| Where the replacement is | It is in **no** export: not in the feed, and not in `integration_state` (Codex's broader search agrees). Export rules drop a never-delivered record whose channel is `retired`. The listed edition (6 Oct 2026) has passed, so the replacement is retired and was never delivered. |
| Correct V3 outcome | The 6 Oct edition is past, so the existing CLOSED/withheld result stands. The request is obsolete. There is no current customer-visible replacement to link. |
| To confirm | The replacement id is recorded in the producer's identity registry (`integration_identity`, natural key containing `marketspread:26215`). One read-only query will name it. |

### `fdx1_f889ad736b6a93511de5`: Nashville Farmers Market (merged)

| Fact | Value |
| --- | --- |
| V3 entity | `ent_dda1403e…` |
| requested_at | 2026-10-09T18:47:53.640Z |
| Old identity | `US\|site:nashvillefarmersmarket.org:nashville farmers market\|standing`. Carried forward as retired / WITHDRAWN: "not produced by the engine for 3 consecutive exports (merged, reclassified or source removed)". |
| Surviving identity | `fdx1_5c40d2efe2d7096eb916`: current, OPEN_NOW, `last_checked` 2026-10-10T20:34:09Z. Natural key `US\|marketspread:12766\|2027`. Its anchors include **both** of the old id's anchors: `url:https://www.nashvillefarmersmarket.org/apply-farmers-market` and `url:https://marketspread.com/market/12766/nashville-farmers-market/apply/6679/vendor/`. |
| Correct V3 outcome | A reviewed supersession of `f889ad` into `5c40d2`. Codex has flagged a 2026/2027 edition difference (the old record was "standing"), so no automatic relink is made. |

## 4. Exact remaining blockers for V3-001

Each is a single-record item. None is a delivery or lifecycle design defect.

1. **`fdx1_86aaebe…`:** audited obsolete-request resolution on V3. Evidence: past edition, plus two `rejected/no_vendor_signal` assessments, the latest from the targeted refetch.
2. **`fdx1_9b04c3e…`:** the same kind of resolution, because the edition is past and the replacement was never delivered. The replacement id will be named from the identity registry.
3. **`fdx1_f889ad…`:** reviewed supersession into `fdx1_5c40d2…`. Evidence: two shared anchors.

**Producer improvement proposed** (not implemented, pending a decision). When an already-delivered id stops being produced, the exporter would re-emit one retired / WITHDRAWN record with a genuine new clock (the latest refetch of its own source page) and an explicit reason: `not_relevant:<reasons>` or `superseded_by:<id>`. Obsolete requests like these three could then be acknowledged on real evidence rather than resolved by hand.
