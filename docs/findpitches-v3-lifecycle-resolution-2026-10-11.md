# V3-001 independent cloud resolution checkpoint — 11 October 2026

Cloud ledger resolution: **14:33:36 Europe/London**; source-proof preview checked **14:35:43**. [Machine-readable checkpoint](../operations/findpitches-v3/reports/lifecycle-resolutions-2026-10-11.json). Producer evidence is Claude/Chris’s [retained six-item review](findpitches-v3-001-producer-evidence-2026-10-11.md), bound by the JSON bundle’s SHA256 in the native audit.

**Five of six lifecycle cases have sufficient evidence. Nashville alone remains open.** The three fresh original-token receipt/selection/ack traces remain complete, including Fiesta. Today’s two resolutions are operator-reviewed obsolete work, explicitly separate from source freshness acknowledgements.

| Producer ID | Native outcome | Request outcome |
| --- | --- | --- |
| `fdx1_86aaebe1504fa56df8c0` | Past 1–6 October UKCF edition; retained selected ENQUIRY_AVAILABLE/UNCHANGED remains unchanged, existing conflicts/proof hold keep it unavailable | Original 9 October token resolved as `obsolete_past_edition`; no fake CLOSED fact or new source clock |
| `fdx1_9b04c3e4d51b66bbcfab` | Past 6 October Ground edition; selected OPEN_NOW/UNCHANGED remains unchanged and held. Replacement `fdx1_f05d338d30aabbc8010f` is same 2026 past edition, retired and never delivered | Original token resolved with producer registry review; no new entity/relink/merge |
| `fdx1_f889ad736b6a93511de5` | Native old 2026 and survivor 2027 editions remain distinct, held identities | Original request retained. Shared standing-market anchors do not prove edition equivalence |

The producer report’s description of the first two as already CLOSED is an outcome shorthand, **not their selected source-field state**. This checkpoint preserves the actual fields and derives no unsupported closure fact.

Added append-only `producer_recheck_resolutions` custody and operator-only `/rechecks/resolve`. The guard binds the exact original request, current entity revision, latest linked producer receipt, past native date/edition and evidence review/reference/hash. It refuses READY/current/replaced-delivered/multi-producer-ID cases. The ingest token cannot use it. Replays retain the same review; a different review cannot silently replace it. Watch skips this obsolete work until genuinely newer producer evidence arrives after review; equal-clock export replay cannot recreate it. This is operational work resolution, never source proof or READY promotion.

Validation: **227/227 V3 tests**, including real workerd/D1 preservation control; **7/7 focused recheck tests**. Deployed only existing owned shadow Workers; additive migration. API/watch deployment custody is in the JSON report. At preview observation: **0/7 cohort/survivor visible**, seven identities and selected field sets unchanged, zero customer projection/publication rows, publication false, bulk paid acquisition off. No producer, V1/V2, mail, billing or production routing changes.

**Exact remaining requirement for Claude:** provide source/edition custody explaining the old exported 2026-10-10 occurrence versus the surviving 2027-02-28 occurrence. A producer-level standing-key merge may be documented as stream replacement, but cannot authorize canonical cross-edition consolidation. Retain both identities and the old request until that distinction is reviewed. V3-001 is not yet supported for DONE; do not reopen paging, source clocks or the complete three fresh traces.
