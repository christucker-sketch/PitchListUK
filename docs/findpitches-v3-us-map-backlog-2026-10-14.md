# US map backlog: 1,000 milestone reached

Codex,14October2026. [Execution order](../team/US_MAP_BACKLOG_ORDER_2026-10-14.md), source claim `3b98bda1`; operator controls `278b3429`, first settled checkpoint `d4d4de47`. This report's containing commit records the completed programme. Native/customer runtime versions were not changed.

At **12:53 London**, **1,002/1,717 current US READY opportunities are mapped (58.36%)**, at **453 distinct coordinate positions across44 state/DC regions**. The1,000 target is met. Coordinate positions are not a certification of453 independent physical venues. All positions remain source-owned venue coordinates or conservative exact-address matches, with explicit interpolation precision and current proof bindings.

Final independent snapshot at **12:59:42 London**: **1,003/1,718 US mapped (58.38%)**, same453 positions/44 regions and715 unpinned. Global READY1,887: US1,718/GB160/NZ5/AU3/CA1. The additional eligible mapped record is a later source-proof refresh, not another provider attempt attributed to these grants. Source/customer counts remain time-dependent.

| Checkpoint | US READY | Mapped | Coverage | Positions | State regions | Provider attempts | Cache hits |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Before programme | 1,719 | 575 | 33.45% | 132 | 31 | 0 | 0 |
| Batch01,12:25London | 1,719 | 845 | 49.16% | 304 | 38 | 250 | 376 |
| Batch02,12:53London | 1,717 | 1,002 | 58.36% | 453 | 44 | 221 | 362 |

**471 new free Census attempts /738 cache hits**, in two separately bounded250-request grants. Batch01 stopped at its cap; batch02 exhausted the remaining candidate population with29 request slots unused. Both grants are paused. There is no standing geocoder schedule or paid search grant. The previous200-request proof run and its two separate probes are outside these471 attempts.

There were **429 successful entity resolutions**, and a **net427 increase in currently mapped opportunities**. Two mapped opportunities ceased being customer-eligible between the browser and final projection snapshots; their causes were not separately re-diagnosed here. Mapping performs no readiness/identity/source-fact updates. It neither created new opportunities nor met the separate US inventory-growth target.

## What remains and the coverage ceiling

All **715 currently unpinned US READY** are accounted for:

| Failure population | Opportunities |
| --- | ---: |
| Missing complete source street/city/state | **291** |
| No exact Census address match | **240** |
| Address component/house-range disagreement | **159** |
| Ambiguous address match | **25** |
| Not attempted | **0** |
| Other source-evidence deficiency | **0** |
| Provider errors | **0** |

No further identical-address requests are justified today. Negative results are cached for24hours; positive exact matches can be reused only with current matching source proof. Another identical pass would not establish stronger evidence.

The ceiling using the present attempted evidence and matching policy is therefore **1,002 mapped** at this snapshot. If every complete-address failure gained demonstrably stronger proof and a defensible match, the mathematical upper bound is **1,426/1,717 (83.05%)**; that is not a recovery forecast. The other291 need source-owned coordinates or a complete source address first. Prefer official organiser/venue evidence and source coordinates; never substitute city/state/ZIP centres, drop disagreeing address components, or change original facts to make a match.

The initial priority census found852 unmapped records with complete retained address evidence and292 lower-priority records. Native full-document re-verification remained the authority; every final unresolved record was classified. The runner's older-receipt JSON-LD fallback supplies priority only and cannot approve a coordinate.

## Controls and verification

- Native caps unchanged:250 provider requests/grant,3,000 maximum entity checks, two-hour grant expiry; actual entity checks627/874 across the two batches, with overlaps reported as checks rather than distinct records.
- Complete source addresses precede incomplete ones; exact-address grouping reuses both successful and negative caches. No source refetches, Serper calls, schema/customer deployments or geographic inference were needed.
- Provider HTTP/throttle/transport, custody and country mismatch stop the operator. Three abnormal responses in the recent sample or fewer than3 successes in25 actual provider attempts also pause it. Cached negative outcomes do not distort the yield sample. No abnormal/error stop was triggered.
- **Full V3 408/408; focused9/9.** Public US32/32 and UK32/32 passed desktop/mobile geometry, every represented ID, actual pointer selection, keyboard, filtering, zero results, redaction and no foreign requests/TLS bypass. US browser snapshot1004/1719 preceded final1002/1717 by seconds; it is not a conflicting atomic measurement. UK123/160 at12 positions remains unchanged.
- Greater density exposed overlapping national-view circles. The check now chooses a truly clickable grouped marker through native hit testing, retaining the physical click and all original assertions. Every marker remains keyboard accessible; filters narrow dense areas. No coordinate displacement or synthetic clustering was introduced. Dense-marker clustering remains a UX follow-up.
- Full original receipt/fact/fixed-identity preservation was checked before and after batches; the accompanying aggregate records exact audit times. Source publication stays off, source customer/publication rows0/0, original build baseline passes, paid manually paused/bulk off/dayqueries0/lifetime29, protected PitchList and V2 unchanged.
- Existing public browsing, account recovery and LIVE Checkout remain enabled; no provider/customer objects, messages, routes, DNS, secrets or production versions were changed by this work.

Final public API/security/SEO/LIVE Checkout-state smoke passed **29/29 at13:03London**, with zero customer/provider objects or messages. The earlier smoke invocation stopped before making any requests because its private output directory did not yet exist; creating that directory and rerunning resolved the local tooling issue. No production flag change resulted.

See [batch01 evidence](../operations/findpitches-v3/reports/us-map-backlog-batch01-2026-10-14.json) and [completed programme evidence](../operations/findpitches-v3/reports/us-map-backlog-2026-10-14.json). These are dated snapshots, not a live inventory guarantee.

## Next ownership and international dependency

V3-018's1,000 milestone and present-population reassessment are complete. Further coverage needs stronger venue/address evidence, not another grant against identical cached failures. Claude/Pi should keep exact source coordinates/addresses attached to new acquisition; Codex retains bindings/current-proof control. Catalogue growth and Free/Pro/billing acceptance remain separate.

The newer [France/international directive](../team/PI_INTERNATIONAL_ACQUISITION_DIRECTIVE_2026-10-14.md) assigns acquisition mechanics to Claude/Pi. V3's current market allowlist rejects `FR` as `unsupported_market`; France intake, source-proof/language/geography and customer compatibility need a separate Codex checkpoint before claiming French cloud delivery/READY. No allowlist or provenance safeguard was weakened here, and no international paid grant was created.
