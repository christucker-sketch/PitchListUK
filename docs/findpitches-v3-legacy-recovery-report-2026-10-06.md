# V2 legacy recovery report — 6 October 2026

Recovery inspected every captured V2 opportunity using SELECT-only reference access. Source-backed reconstructions were imported into V3 as `legacy_v2` evidence and reconciled in shadow scope. No V2 customer table was bulk-copied, and V2 was not modified.

The capture contains 34,507 opportunity-bearing rows represented in 31,203 recovery units: candidate/customer pairs and explicitly or uniquely linked structured baselines share a unit. Auxiliary evidence brings the total reference rows read to 38,984. The capture window is recorded rather than claimed as a transactional snapshot.

| Final disposition | Recovery units |
| --- | ---: |
| Recoverable from retained evidence | 2,053 |
| Recoverable by re-fetching the original source | 3,544 |
| Uncertain/quarantine | 25,606 |
| Total inspected | 31,203 |

These categories are mutually exclusive after identity review. Source reconstruction itself succeeded for 2,062 retained-evidence units and 3,578 direct-source units; nine retained and 34 re-fetched records remain quarantined on identity grounds. Quarantine comprises 25,415 source-stage holds, 148 subsequent source-qualification holds and 43 additional identity holds. Failed, rate-limited, unsafe, unsupported or ambiguous sources remain reviewable; quarantine is not a claim that every source is permanently unrecoverable.

| Reconciliation result | Count |
| --- | ---: |
| Recovered records matched to existing V3 entities | 878 |
| Distinct new V3 entity IDs | 4,458 |
| Additional recovery units matched within the new population | 261 |
| Pending identity decisions | 0 |

“Existing” includes the initial V3 population and entities first created by other producers during recovery. New entity counts follow conservative source/market/edition identity rules; independently labelled real-world uniqueness is still unavailable.

| Field comparison / integrity check | Count |
| --- | ---: |
| Historical field values preserved | 5,196 |
| Historical field values repaired from stronger evidence | 4,514 |
| Historical values withheld without qualified support | 65,728 |
| Retained structured baseline field comparisons unchanged | 19,059 |
| Retained baseline comparisons differing or withheld in reconstruction | 59 |
| Historical discovery markets repaired from direct country evidence | 28 |
| Immutable recovery receipts verified, including held evidence | 5,788 |
| Immutable recovery source fields verified | 38,926 |
| Destructive source-field mutations | 0 |
| Unsupported customer values imported | 0 |

Historical comparisons use customer fields when present, otherwise candidate fields. Differing/withheld reconstructed values do not alter the original evidence. UNKNOWN/WATCH defaults are distinguished from newly populated source information in the per-field report. These are preservation and repair comparisons, not independently labelled field-truth scores.

Every original live independent-producer receipt and all 10,743 source fields across 887 records also remained unchanged. The deployed 100-row control passed again with zero destructive mutations. Eleven earlier selected authorities were upgraded to stronger identical-value proof without changing values. Source-quality holds retain their receipts/facts; entities whose selected fields still depend on held evidence are blocked.

All recovered evidence remains shadow-only and pending audit. Customer projections and publication rows remain zero; publication and paid bulk acquisition are disabled. Recovery used original-source fetches and issued zero Serper searches. Today's retained provider counters attribute 1,504 attempts to V2 and one earlier canary query to V3; exact billed-credit allocation cannot be established. V3 limits are four queries/credit budget units per run, 100 per hour and 1,000 per day, with reservations and automatic pauses exposed in `/status`.

The [complete aggregate JSON](../operations/findpitches-v3/reports/legacy-v2-recovery-2026-10-06.json) contains category definitions, source reasons, per-field comparisons, selection decisions and integrity checks. See the [recovery runbook](findpitches-v3-legacy-recovery.md) and [validation record](findpitches-v3-validation.md) for operation and verification. Raw V2 snapshots, source caches and credentials remain outside the checkout.
