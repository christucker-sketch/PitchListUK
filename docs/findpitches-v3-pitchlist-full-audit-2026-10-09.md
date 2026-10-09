# Complete live Pitchlist UK catalogue audit — 9 October 2026

Pitchlist has useful recoverable content, but the catalogue mixes trading opportunities with licensing resources, expired documents and records whose sources cannot yet be proved. This audit inspected all **290 UK records**, checked **436 distinct retained source/application URLs**, and decoded/reviewed **20 PDFs**. It admitted **three source-backed recoveries** to V3 shadow: **one READY and two WATCH**, through ordinary identity reconciliation. Two created new entities; Farnham matched an existing entity. There was no bulk copy of customer fields.

## Live catalogue custody and scope

The anonymous live `pitchlist.uk/api/customer-opportunities/search?limit=50` returned total **290** and a 50-row preview. All preview IDs match the UK catalogue at the declared production build. Pages production deployment `7f359dff-0702-4acb-aa69-2f28859c91ce` points to Git `325d65dde304abc6288d48e468e28299eeef7eb3`, created on 28 September. The production deployment was unchanged at the final check.

The full retained UK build is `functions/_data/opportunities.mjs`; its rows all assert `United Kingdom` and `pitchlist.uk`. The audit parses its JSON literal as data without executing the module. US and Canadian repository datasets, V2 rows and the earlier international Rockport recovery are excluded. The earlier [scope-correction report](findpitches-v3-mk1-catalogue-audit-2026-10-09.md) describes the superseded twelve-source UK inspection.

No subscriber session or billing workflow was exercised, and the full subscriber response was not independently downloaded. Live total, preview membership, declared production build and the unchanged deployment provide the catalogue linkage. This is a catalogue/evidence audit, not a subscriber experience test.

## Per-record findings

| Assessment | Records | Interpretation |
| --- | ---: | --- |
| Clearly usable | **1** | Specific current event, source-bound UK venue/date/organiser, proved open trader form |
| Usable with minor gaps | **2** | Practical trading route with current date or recurring market; unresolved availability or precise venue |
| Questionable / further evidence needed | **217** | Source-bound proof or page access is incomplete; this is not a finding of junk |
| Reference only | **53** | Licensing, permissions, guidance or supporting material; useful information, not proved offered opportunities |
| Explicitly closed/stale | **8** | Source closure, past event/edition or expired application coverage |
| Wrong/unsafe for this UK recovery | **9** | Eight 404 source routes and one source that proves a US event |
| **Total** | **290** | Every UK build row has an assessment |

The automated classifier is conservative and has not manually adjudicated every HTML page. Eight primary-source PDF assessments were resolved by document review bound to the retained binary hash: five licensing/guidance documents, the Bolton 2019 festival letter, the Salisbury April 2025–March 2026 application, and Salisbury Street Sellers' elapsed 2026 dates/deadline. Remaining incomplete proofs remain unresolved. Ten other attachment responses were held for format/access review.

Dominant unresolved groups include missing source-bound country/location proof, pages without a clearly specific trader offer, incomplete/dynamic page content, inaccessible sources and unproved current editions. Some of these may be useful to a trader and recoverable with source-specific extraction or manual evidence review. The confirmed problems do not justify condemning all remaining records.

A source URL returning 404 is an observed broken route, not proof that the underlying event has ceased to exist. General permission forms are kept distinct from an actual available market pitch. Source-defined dates, deadlines and availability are not invented to increase the recovery count.

## Recovered shadow records

| Original ID | Recovery | Outcome | Source-backed detail and remaining caveat |
| --- | --- | --- | --- |
| OPP-00495 | Northampton's Annual Fireworks Spectacular | **New entity, READY** | 1 November 2026; The Racecourse, Northampton; Northampton Town Council; actual business/food application form with APPLY NOW |
| OPP-00726 | Northallerton recurring market | **New entity, WATCH** | North Yorkshire Council; Wednesday/Saturday market; linked 2026–27 trader application PDF; state remains UNKNOWN |
| OPP-00574 | Farnham Christmas Market | **Existing entity matched, WATCH** | 13 December 2026; Farnham Town Centre; Farnham Town Council; actual stallholder form; exact pitch location still to be confirmed, state remains UNKNOWN |

The final field audit found Farnham's existing entity had selected an older Gostrey Meadow application link. Native re-verification added direct evidence of the actual same-page Christmas Market trader form using the existing `direct_form` proposal model (authority 95), superseding the older route (authority 80). The older receipt and source fact remain intact; the entity ID, country and edition did not change. This proves the application route only: availability stays UNKNOWN and the record remains WATCH. Three distinct recovered original rows produced four recovery receipts after this targeted refresh, plus one additive direct-form evidence receipt. These observations are not four recovered opportunities.

Northallerton's PDF was directly fetched by the Worker, validated by MIME/signature/size and matched to the exact SHA-256 of the reviewed current document. A working PDF URL alone does not admit a record. Farnham's broad source-supported location and the exact-location caveat remain explicit; no possible pitch location was selected as fact.

Recoveries are attributable to the dedicated **`legacy_mk1`** producer. Each receipt retains the original row and its hash, production Git reference and snapshot hash, source-document hash, per-field citations and practical audit grade. Historical customer values are selected only where the current scoped source literally corroborates them. Repairs are new source facts; original evidence remains immutable. Existing exact identity gates decide matches. No classification or verification stage silently rewrites country, edition or entity identity.

The Northampton verifier supports this specific official council event/application profile. It requires the literal named event, date and venue, consistent weekday, council relationship, active relevant POST form and explicit invitation to apply; closure, waitlist, past date or absent enabled submit prevents READY. Generic verification remains conservative.

## Safety and verification

Only the eight owned `findpitches-v3-*-shadow` Workers were redeployed. No Pitchlist Pages deployment, V2 data/infrastructure, live routing, subscription or production branch changed. Paid acquisition remains paused and all recovery requests use direct original-source fetches.

The full preservation comparison covers every pre-existing producer receipt and source fact, alongside entity market/edition/shadow/publication identity guards. The final comparison preserved **15,652 receipts and 106,897 source facts**, including the first three recovery receipts. It found **zero source mutations, zero identity mutations, zero additional paid queries and zero customer/publication rows**, with no due reconciliation/verification jobs remaining. The [aggregate report](../operations/findpitches-v3/reports/pitchlist-uk-full-audit-2026-10-09.json) records these counts and the linked/new/matched outcomes. Operator-only routes reject the producer ingest credential. The full V3 suite passes **179 tests**, including native D1 preservation, replay, custody, country-conflict and document-review admission tests. Runtime/resource boundary validation passes.

A page-theme parsing defect was corrected: menu-related classes on a whole HTML/body wrapper must not suppress its main content. Actual navigation/footer descendants remain excluded. This changes extraction only, preserving every original document. A regression test proves that unrelated navigation/application and foreign footer content stay excluded.

## Review artifacts and next work

The complete per-record CSV is `pitchlist-uk-full-audit.csv` in the private audit output directory, with original IDs/titles/routes, grades, reasons, recovered application route and document-review notes. Retained HTML, PDF binaries, original build data and private preservation baselines remain outside Git. The public-to-repository aggregate has no subscriber credentials or raw catalogue export.

The next useful task is a prioritised direct-source/manual evidence pass over the **217 unresolved rows**, starting with named recurring markets and official organiser application pages. Access failures, source geography and source-specific extraction should be resolved before importing these records. Licensing/reference material should remain useful supporting information rather than inflate opportunity counts. No Serper acquisition is needed to begin this work; publication remains disabled.
