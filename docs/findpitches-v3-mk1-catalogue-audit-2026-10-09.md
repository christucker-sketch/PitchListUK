# Original Mk1 catalogue recovery — 9 October 2026

The original Pitchlist Mk1 catalogue has not been completely represented in V3. It is a useful source of retained organiser/application leads, but historical listings do not establish current availability. A targeted, free source check recovered one genuinely new READY opportunity into shadow inventory. No Serper queries were used.

## Catalogue and coverage

Mk1 is the Cloudflare Pages project `pitchlistuk`, with the domains `pitchlist.uk` and `findpitches.com`. It is separate from the V2 acquisition/recovery database and from the legacy global discovery Worker.

Read-only Pages metadata identifies production deployment `7f359dff-0702-4acb-aa69-2f28859c91ce`, created on 28 September, and its declared Git commit `325d65dde304abc6288d48e468e28299eeef7eb3`. The catalogue JSON in that commit contains 997 rows. The current `origin/main` catalogue has identical data. Public Pages/API requests failed from this environment; these counts describe the catalogue in the deployment's declared build commit, rather than an independently downloaded rendered API response.

Coverage was measured before the new import, at **11:10 London time on 9 October**:

| Country | Mk1 rows | Matching V3 source/application evidence | No matching V3 evidence | Matching V2 route | Existing READY source overlap |
| --- | ---: | ---: | ---: | ---: | ---: |
| GB | 290 | 31 | 259 | 50 | 0 |
| US | 704 | 70 | 634 | 90 | 32 |
| CA | 3 | 0 | 3 | 0 | 0 |
| Total | **997** | **101** | **896** | **140** | **32** |

The comparison uses source/application URLs in the same country, normalising `www`, tracking parameters, fragments and trailing slashes. It establishes potential source coverage, not identity or edition equivalence. The 32 existing READY overlaps are US sources already represented in V3; they are not 32 newly verified Mk1 opportunities. Conversely, absence of a URL match does not prove that an opportunity cannot already exist under another route.

Of the 896 without matching linked evidence, 29 already have unlinked free-catalogue discovery and retained source documents, often with closed/stale holds. The other 867 have neither matching linked evidence, catalogue discovery nor retained source documents in the inspected V3 tables. Two duplicate Mk1 route sets were detected, without automatic identity merging.

## Direct-source check and recovery

We checked **43 distinct source routes**: 12 UK organiser/market pages, 28 US application/organiser routes, and all three Canadian entries. This was a targeted sample, not a random commercial-quality estimate. Recently checked catalogue routes with closed/stale results were deprioritised.

| Source-proof result | GB | US | CA | Total |
| --- | ---: | ---: | ---: | ---: |
| Verified | 0 | 1 | 0 | **1** |
| Partial | 0 | 10 | 0 | **10** |
| Unverified | 12 | 4 | 3 | **19** |
| Quarantine | 0 | 13 | 0 | **13** |

Recurring blockers included 19 closed/past-deadline applications, 12 stale editions, 15 sources without extractable single-event data, and four pages without a scoped event. Reason counts overlap. Other holds included contradictory edition/date information, cancelled/postponed events, missing venue proof and unproved vendor applications.

UK generic-parser failures do not establish that every underlying market is unusable. They show where source-specific extraction is needed. The three Canadian rows are business/farmers-market guidance, rather than individual trading opportunities. Historical application links also included contact pages, licences and supporting documents; an application-shaped URL alone is insufficient.

The one fully proved source was **2026 December Rockport Market Days**, Texas, starting **18 December 2026**, with an **OPEN_NOW** vendor application at [Eventeny](https://www.eventeny.com/events/vendor/?id=34671). A fresh fetch inside the deployed V3 enrichment Worker confirmed the source independently of the inspection file. Normal reconciliation created one new entity and the commercial proof gate returned READY. It remains shadow-only.

The preservation audit checked all **15,395 pre-existing producer receipts** and **104,118 source facts**: zero destructive mutations, zero identity mutations and no missing original entities. The import used zero paid queries and produced zero customer or publication rows. The durable reconciliation/verification queue had no due jobs at the subsequent status check. Total shadow READY inventory then stood at **1,890**; only the one Rockport entity is attributed to this Mk1 recovery.

## Safe repeatable import

The new enrichment route `POST /mk1/verify-import` requires the operator token. The producer ingest-only token is rejected, including in the live deployment check. It accepts one retained row with country, Git commit and snapshot hash, checks shadow/paused-paid/preservation/backlog guards, then fetches the original public source itself. Client-provided HTML cannot manufacture proof.

Only a fully verified source with matching source-proved country enters the normal `platform-catalogue` producer path. All selected facts come from the fresh source proof. The original Mk1 row is retained as immutable provenance with `discovery_origin: legacy_mk1`, original-row hash, catalogue hash and Git custody. Normal entity reconciliation and revision-bound readiness remain in force. A match whose selected verification route differs is held for verification of that retained route.

The bounded CLI consumes the privately captured build catalogue and inspection receipts:

```bash
node operations/findpitches-v3/harvest-mk1-proof.mjs \
  --credentials /secure/cloudflare.env \
  --state-dir /secure/owned-v3-shadow-state \
  --audit-dir /secure/mk1-audit \
  --maximum 10
```

The CLI accepts at most 40 proved records, stores a full private preservation baseline and verifies the resulting identities, readiness and disabled paid/publication state. Unverified sources remain inspection evidence rather than promoted entities. Refreshes preserve previous facts; identical inputs at the same evidence timestamp replay without new receipts or entities. The native Worker uses transactional D1 ingestion, rather than simulating a transaction through the remote query adapter.

All **168 V3 tests passed**, including source-only fact selection, historical-field preservation, country conflicts, closed applications, source/Git custody, live-fetch isolation, operator access, replay and paused-shadow guards. Only the owned V3 shadow enrichment Worker was deployed. No schema, Mk1, V2, publication or production routing changes were made.

## Next useful work

Prioritise the retained UK organiser and recurring-market application routes, distinguish actual trading opportunities from generic licensing/guidance, and add source-specific extraction where the page supports defensible venue, geography, availability and application proof. Check the strongest current editions first and reuse retained closed/stale results. Existing US platform applications are another bounded free lane, but should not displace UK coverage.

There is no defensible estimate of hundreds of extra READY records from this selected sample. The catalogue provides leads and provenance; fresh source proof determines commercial recovery. Keep paid acquisition paused and publication disabled throughout.

The [aggregate machine-readable report](../operations/findpitches-v3/reports/mk1-catalogue-audit-2026-10-09.json) contains the exact coverage, proof outcomes and successful import audit. Full catalogue rows, fetched documents and Cloudflare project configuration remain private and outside Git.
