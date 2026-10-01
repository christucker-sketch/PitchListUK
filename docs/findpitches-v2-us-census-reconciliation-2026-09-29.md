# US Census import reconciliation — first 50-state result (2026-09-29)

Source: user's exported `FindPitches-US-Census-Reconciliation.zip` from a successful offline index build.
Index SHA-256: `E12F3EF7591870E7CF7EBEC37DFD7301DBC2F80542B2FFBF8A221A3657CF55E7`.
Sources are **2025 Census place geography** and **2020 decennial population**. The mixed vintage prevents treating major-city numbers as final/current.

## Reconciled inventory and unresolved categories

| Category | Count |
|---|---:|
| State scope | 50 |
| Place records | 32,057 |
| Incorporated places | 19,497 |
| Census-designated places | 12,540 |
| Unclassified/special LSAD | 20 |
| 2020 population matched | 31,559 |
| 2020 population unmatched, preserved as null | 498 |
| Unmatched incorporated places | 37 |
| Matched incorporated places at >=100,000 population | 314 |
| Matched unclassified/special-government places at >=100,000 | 7 |

Of the 20 special LSAD cases, 13 are `00`, three `UG`, and one each `CG`, `UC`, `MG`, `CN`. The seven populous cases that **must remain separately visible for acquisition planning** pending verification of Census legal status and boundary rules are:

- Athens-Clarke County unified government (balance), GA — 127,315
- Augusta-Richmond County consolidated government (balance), GA — 202,081
- Macon-Bibb County, GA — 157,346
- Indianapolis city (balance), IN — 887,642
- Lexington-Fayette urban county, KY — 322,570
- Louisville/Jefferson County metro government (balance), KY — 386,884
- Nashville-Davidson metropolitan government (balance), TN — 689,447

Their `large_special_government_review` tier prevents omission from acquisition prioritisation **without** adding them to the known incorporated-city >=100k denominator. They must not be assumed equivalent to ordinary municipality boundaries: consolidated-government counts and balances can overlap other places.

The 37 unmatched incorporated entries include legal/municipal changes and potentially changed identifiers, e.g. St. George LA, Mulberry GA, Cahokia Heights IL, several MA/PA legal-form names and TX/WI towns. **Do not assign a guessed population** or blindly transfer a predecessor's value; reconcile by current Census GEOID, boundary and name/legal type. 20 special LSAD cases require an explicit legal-status determination before the 50-state municipality denominator is final.

## Observed initial state distribution (matched incorporated >=100k only)

California 75, Texas 40, Florida 22, Colorado 12, Arizona 10, North Carolina 10, Washington 10. Six states had no incorporated >=100k places under this narrow definition: DE, HI, ME, VT, WV, WY. That is **not a reason to deprioritise any state**: small municipalities, CDPs and county fairgrounds can be commercially important.

## Next execution checkpoint

1. Review 37 unmatched incorporated places; obtain current-vintage population estimates where available; mark vintage, data source, geographic match confidence and whether a place was created after the 2020 Census.
2. Review 20 special legal-status rows and explicitly categorise consolidated, balance and other exceptional jurisdictions. Preserve seven populous cases in additional acquisition-priority tier pending this review.
3. Run the read-only actual US customer-inventory state funnel (draft #1871) against v2 D1. **Do not confuse candidate discovery region with verified event venue**, and do not present source-backed projection counts as API-visible inventory.
4. Only then use city/metro/county gap scores to schedule additional discovery. Baseline acquisition stays uninterrupted and v2 publication stays disabled.

This report is an **offline data-model audit**. No new Cloudflare D1 data, live acquisition jobs or paid catalogue records were created by it.
