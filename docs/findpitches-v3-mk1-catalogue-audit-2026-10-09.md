# Pitchlist UK catalogue audit — scope correction, 9 October 2026

**Pitchlist is the UK-only live product with paying customers.** Its customer catalogue must be audited independently of the international FindPitches datasets stored in the same repository.

The earlier version of this report incorrectly combined 290 UK rows, 704 US rows and three Canadian rows into a supposed 997-row Mk1 catalogue. That aggregate, the international closed/stale findings and the Rockport US recovery are **not results about the UK Pitchlist customer inventory**. This report corrects that interpretation. No customer-facing catalogue, subscription, source evidence or entity identity was changed.

## Confirmed UK route and retained catalogue

The UK customer frontend `src/database.js` requests `/api/customer-opportunities/search`. Its handler imports only `functions/_data/opportunities.mjs`. The US and Canadian handlers import separate datasets. `platform/routing.mjs` maps `pitchlist.uk` to the UK country surface; international host routing applies to `findpitches.com`.

Read-only Cloudflare Pages metadata identifies production deployment `7f359dff-0702-4acb-aa69-2f28859c91ce`, created on 28 September, with declared Git commit `325d65dde304abc6288d48e468e28299eeef7eb3`. The **UK catalogue in that commit contains 290 rows** and matches the inspected current-main UK snapshot. Public Pages/API fetching failed from this environment, so the actual rendered live API count and paying-customer experience have not been independently checked. The shared Pages project and repository do not make its international datasets part of the UK customer inventory.

UK coverage was compared with V3 at **11:10 London time on 9 October**:

| UK catalogue measure | Rows |
| --- | ---: |
| UK rows in the inspected build | **290** |
| Matching V3 source/application evidence | **31** |
| No matching V3 source/application evidence | **259** |
| Matching V2 route | **50** |
| Matching currently READY V3 source | **0** |
| Additional unlinked catalogue discovery among uncovered rows | **1** |
| No matching linked evidence, catalogue discovery or retained document | **258** |

Matching is based on source/application URLs in the same country, with tracking parameters, fragments, `www` and trailing slashes normalised. It establishes source coverage, not entity identity, edition equivalence, customer usefulness or proof of commercial readiness. An absent route match does not prove that an equivalent entity cannot exist under another URL. The 259 uncovered routes provide a recovery investigation list; they are not 259 proven new READY opportunities.

## What the UK checks actually established

Only **12 selected UK organiser/market sources** were fetched. All 12 returned `single_event_source_data_missing` from the generic verifier. None supplied verified source proof sufficient for V3 READY, and **no UK record was imported or promoted by this audit**.

These were targeted routes without matching V3 evidence, not a representative sample of customer inventory. The result establishes an extraction/proof gap, not that the listings are junk. Council trading routes and recurring markets may be commercially useful without exposing the single-event data required by the current parser. A customer-usefulness percentage remains **unmeasured**.

The previous aggregate findings of 19 closed/past-deadline applications and 12 stale editions came entirely from the international subset. They cannot be used to judge the UK Pitchlist catalogue.

## International work excluded from Pitchlist totals

The other 31 checked routes belonged to the separate US/Canadian repository snapshots. One US Eventeny application, **2026 December Rockport Market Days**, was directly proved current and became one new V3 shadow READY entity. It remains valid international source-backed V3 inventory, but is **not a recovery from live UK Pitchlist**.

The original receipt incorrectly carried a `legacy_mk1` discovery label because of the earlier scope mistake. That historical receipt is immutable. This report preserves it and records the corrected scope; it does not rewrite source facts, geography or identity. The previous aggregate source-preservation audit checked 15,395 existing receipts and 104,118 source facts with zero mutations, zero paid queries and zero customer/publication leakage. Those are V3 safety results, not UK catalogue-quality results.

## UK-only recovery guard

Both `mk1ProofRecord` and operator-only `POST /mk1/verify-import` now reject markets other than **GB**, before fetching or importing a source. The bounded CLI filters inspection inputs to GB. An explicit regression check rejects US and CA admission without a fetch. This prevents international snapshots being attributed to UK Pitchlist by this recovery lane.

The route still fetches source proof itself, enforces paused paid acquisition, disabled publication, the preservation gate and controlled backlog, and uses normal transactional ingestion/reconciliation. Historical Mk1 fields are immutable provenance, never selected facts or readiness proof. Country comes from source evidence and must match GB. The producer ingest-only token cannot use the route.

```bash
node operations/findpitches-v3/harvest-mk1-proof.mjs \
  --credentials /secure/cloudflare.env \
  --state-dir /secure/owned-v3-shadow-state \
  --audit-dir /secure/mk1-audit \
  --maximum 10
```

All 168 V3 tests pass. Live admission checks reject both US and CA inputs. Only the owned V3 shadow enrichment Worker is deployed for this guard correction. No production site, V2, publication, routing, schema or subscription changes are involved. Source evidence and previously recorded identities remain preserved.

## Next useful audit

Assess a representative sample of the **UK customer catalogue** for practical trader usefulness: a real trading opportunity or recurring market, relevant organiser, location, a working and relevant application/contact route, eligibility, current availability and any advertised edition/deadline. Include council routes, recurring markets, fairs/festivals and independent organisers. Separate confirmed closed/stale/broken routes from parser uncertainty and minor missing fields.

Customer usefulness and V3's strict automatic READY gate must be reported separately. Retained source facts should support additive source-specific verification without inferred countries/dates, navigation links as applications or unsupported promotion. Keep this inspection read-only, paid acquisition paused and customer publication unchanged.

The [corrected aggregate report](../operations/findpitches-v3/reports/mk1-catalogue-audit-2026-10-09.json) contains UK-only coverage and verification results, with international checks explicitly segregated as out of scope. Original private snapshots remain outside Git.
