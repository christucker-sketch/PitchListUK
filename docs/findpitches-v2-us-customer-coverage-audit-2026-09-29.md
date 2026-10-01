# FindPitches v2 US customer-visible coverage audit — 2026-09-29

Snapshot: **2026-09-29T19:34:16.585Z** (20:34:16 BST). Source: isolated v2 D1 database `6732bcc9-a172-4d38-ad4d-7660ed13392f`, read-only. Publication remained disabled. No acquisition, classification, enrichment, PDF recovery or promotion lane was changed.

## Definitions and national result

- **Candidates — 4,598:** every US candidate row, grouped below by acquisition `region_code`, regardless of candidate status.
- **Validated — 860:** candidate status `validated` at the snapshot.
- **Projected validated — 840:** validated candidates with a customer projection, before currentness, location and visibility gates.
- **Current source-backed projections — 359:** validated candidate; projection is not older than the candidate and has nonblank `location` and `location_evidence_url`. This is not an API-visible count.
- **Genuinely customer-visible by code — 352:** the shared draft protected-API policy requires a validated/published candidate, no current-revision `not_ready` disposition, source-backed nonblank location, non-expired deadline/event, 60-day projection freshness, then the shared in-code customer-readiness assessment. The audit read 100 rows per keyset page and rejected zero additional rows after SQL.
- **Independently verified event venues — 31:** manual semantic review found a specific event/market venue or address in the cited source. These 31 all matched a defensible Census place GEOID.
- **Unresolved — 321:** 304 stored excerpts were present but did not prove a specific event venue, seven stored excerpts/locations were no longer reproduced, and ten evidence URLs could not be re-fetched (seven HTTP errors, three fetch failures).

The decisive quality result is therefore **31 / 352 (8.8%)** customer-visible records with a verified venue-place match. A nonblank evidence URL is not enough: common false extractions include interface phrases such as “in real-time”, booth-placement text, regulatory wording, organiser/contact offices and general regional references.

## Counts by acquisition state

These are discovery/acquisition states, not verified venue states. Two verified venues demonstrate the distinction directly: one VA-acquired record is in Atlanta, GA and one AR-acquired record is in Orlando, FL.

| State | Candidates | Source-backed projections | Customer-visible |
|---|---:|---:|---:|
| AL | 116 | 13 | 13 |
| AK | 91 | 5 | 4 |
| AZ | 111 | 5 | 5 |
| AR | 82 | 2 | 2 |
| CA | 84 | 7 | 7 |
| CO | 97 | 11 | 11 |
| CT | 84 | 6 | 6 |
| DE | 92 | 9 | 9 |
| FL | 118 | 13 | 13 |
| GA | 93 | 9 | 9 |
| HI | 76 | 7 | 6 |
| ID | 93 | 11 | 11 |
| IL | 120 | 9 | 9 |
| IN | 89 | 8 | 8 |
| IA | 102 | 8 | 8 |
| KS | 88 | 11 | 11 |
| KY | 116 | 7 | 7 |
| LA | 93 | 6 | 6 |
| ME | 85 | 2 | 2 |
| MD | 77 | 7 | 7 |
| MA | 109 | 4 | 3 |
| MI | 125 | 12 | 12 |
| MN | 58 | 6 | 6 |
| MS | 93 | 8 | 8 |
| MO | 96 | 6 | 6 |
| MT | 81 | 5 | 5 |
| NE | 78 | 6 | 6 |
| NV | 81 | 6 | 5 |
| NH | 107 | 5 | 5 |
| NJ | 104 | 10 | 10 |
| NM | 73 | 4 | 4 |
| NY | 113 | 11 | 11 |
| NC | 114 | 9 | 9 |
| ND | 57 | 5 | 5 |
| OH | 99 | 8 | 6 |
| OK | 117 | 8 | 8 |
| OR | 62 | 8 | 8 |
| PA | 88 | 6 | 5 |
| RI | 107 | 3 | 3 |
| SC | 78 | 3 | 3 |
| SD | 75 | 6 | 6 |
| TN | 108 | 10 | 10 |
| TX | 114 | 10 | 10 |
| UT | 98 | 3 | 3 |
| VT | 52 | 6 | 6 |
| VA | 58 | 6 | 6 |
| WA | 87 | 7 | 7 |
| WV | 98 | 10 | 10 |
| WI | 94 | 7 | 7 |
| WY | 67 | 5 | 5 |

## Verified Census place coverage

All accepted identifiers were checked against the official 2025 Census national place Gazetteer. The 31 opportunities cover 29 unique places; duplicate visible records account for two opportunities in Washta and two in New York City.

| Venue state | Census place | GEOID | Visible opportunities |
|---|---|---:|---:|
| AK | Anchorage municipality | `0203000` | 1 |
| AL | Cullman city | `0118976` | 1 |
| AL | Gadsden city | `0128696` | 1 |
| CO | Greeley city | `0832155` | 1 |
| DE | Dover city | `1021200` | 1 |
| DE | Harrington city | `1033120` | 1 |
| FL | Orlando city | `1253000` | 1 |
| GA | Atlanta city | `1304000` | 1 |
| GA | Suwanee city | `1374936` | 1 |
| IA | Hiawatha city | `1935940` | 1 |
| IA | Washta city | `1982380` | 2 |
| IN | La Porte city | `1842246` | 1 |
| KY | Louisville/Jefferson County metro government (balance) | `2148006` | 1 |
| MD | Frederick city | `2430325` | 1 |
| ME | Millinocket CDP | `2345845` | 1 |
| MN | Burnsville city | `2708794` | 1 |
| MN | Minneapolis city | `2743000` | 1 |
| MO | Jefferson City city | `2937000` | 1 |
| ND | New Salem city | `3856700` | 1 |
| NM | Albuquerque city | `3502000` | 1 |
| NV | Reno city | `3260600` | 1 |
| NY | New York city | `3651000` | 2 |
| NY | Watertown city | `3678608` | 1 |
| OK | Durant city | `4022050` | 1 |
| TX | San Antonio city | `4865000` | 1 |
| VT | Putney CDP | `5057625` | 1 |
| VT | Rutland city | `5061225` | 1 |
| WA | Puyallup city | `5356695` | 1 |
| WI | Seymour city | `5572725` | 1 |

Against the documented mixed-vintage priority set, verified coverage exists for **9 / 314 incorporated major cities**: Albuquerque, Anchorage, Atlanta, Greeley, Minneapolis, New York, Orlando, Reno and San Antonio. Verified coverage also exists for **1 / 7 special-government priority areas**, Louisville/Jefferson County balance. The remaining **305 major-city and six special-government targets are incomplete/unknown, not zero**: 321 visible opportunities still lack defensible venue GEOIDs and the repository does not contain the original full population-index JSON, only its reconciled counts and checksum.

One accepted venue source describes a 2022 Albuquerque event despite passing the current code visibility rules, and two Washta rows appear to be duplicate customer-visible records. Venue correctness therefore does not prove opportunity freshness or uniqueness.

## Gaps and next action

1. Tighten location extraction and readiness so a source URL plus a regex fragment cannot qualify as a venue. Require venue semantics and reject UI, policy, office/contact and booth-allocation phrases.
2. Re-enrich the 304 semantically insufficient rows from their already-known sources, preserving the current strict gate rather than promoting acquisition-region guesses.
3. Prioritise targeted discovery where the priority denominator is largest and verified major-city coverage is absent or nearly absent: California (75 priority incorporated cities, no verified match), Texas (40, only San Antonio), Florida (22, only Orlando), Colorado (12, only Greeley), Arizona (10, none), North Carolina (10, none), and Washington (10, no verified major-city match).
4. Seed city-specific searches for the largest obvious holes—Los Angeles, San Diego, San Jose, San Francisco, Houston, Dallas, Austin, Fort Worth, Miami, Tampa, Denver, Phoenix, Charlotte, Raleigh and Seattle—while leaving the existing state acquisition schedule untouched.
5. Add duplicate suppression and content-date checks; the Washta duplicate and stale Albuquerque page show that venue matching alone is not a launch-quality gate.

No city is reported as having zero opportunities. A city without an accepted match remains unknown until the 321 unresolved rows are repaired or conclusively excluded.
