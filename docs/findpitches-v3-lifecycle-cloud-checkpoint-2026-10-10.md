# First Pi lifecycle feed: cloud checkpoint

Codex read-only inspection on 10 October 2026. Cohort and customer snapshot observed at **12:22 London**; full preservation check completed at **12:24:32 London**. [Sanitized machine evidence](../operations/findpitches-v3/reports/producer-lifecycle-2026-10-10.json). Private receipts and customer/provider credentials remain outside GitHub.

The first feed safely linked all 119 new receipts to existing V3 entities and withheld all 119 entities from the customer proof snapshot. **113 selected lifecycle states advanced; six equal-source-clock disagreements remain explicit conflicts.** This closes the initial cloud linkage/withholding inspection, with exceptions. It does not complete Claude's all-page producer execution task.

## Delivery attribution

The Pi status `checked_at` was 11:00:24 UTC / 12:00:24 London. That is the later status observation, not the cloud import start. The matching cloud delivery comprised **82 batches**, recorded from **11:50:39.860 to 11:56:42.098 London**. Their totals exactly match the handover:

| Measure | Count |
| --- | ---: |
| Submitted / accepted | 2,044 / 2,044 |
| Unchanged duplicate receipts | 1,925 |
| New lifecycle receipts | 119 |
| Rejected | 0 |
| WATCH-channel receipts, internally CLOSED | 100 |
| Retired-channel receipts, internally WITHDRAWN | 19 |
| EXACT_MATCH decisions to prior same-producer identity | 119 |
| Distinct existing entities | 119 |
| New entities from this cohort | 0 |
| Cohort entities in customer snapshot | 0 |

All 119 producer IDs have earlier receipts linked to the same single entity. Every linked entity predates its new lifecycle receipt. No implicit identity change or duplicate entity growth occurred in this cohort.

## Internal state and exceptions

Selected lifecycle states are **98 CLOSED, 15 WITHDRAWN and six retained UNCHANGED**. The latter comprise two WATCH-channel and four retired-channel entities. The six new receipts carry exactly the same `last_checked` as the prior selected evidence, from 4 October, at the same authority. Eleven application/lifecycle conflicts remain `equal_authority_disagreement` across those six entities. Delivery time is not stronger source evidence.

Do not force these state selections or invent a new source timestamp. They need a genuine newer source check or separately evidenced lifecycle transition. Their non-current feed channel and conservative readiness path already withhold them. At inspection, 113 cohort entities had blocked readiness and six had no current readiness row; **none was customer-visible**. The retained readiness/assessment cache is not permission to bypass the customer snapshot.

## Retained real trace

Entity `ent_8c9812f700e87367271684ddf8945a4d` retains an earlier OPEN_NOW / UNCHANGED receipt with source check **4 October, 17:44:37 UTC**. A new WATCH-channel CLOSED receipt was ingested at **10 October, 10:56:16.968 UTC**, carrying source check **05:23:43 UTC**. It reconciled to the same entity, selected CLOSED application/lifecycle facts and derived blocked readiness. The entity was absent from the customer snapshot at **11:22:25.751 UTC**.

An immutable acknowledgement at **10:56:59.071 UTC** references that exact new receipt, producer ID, entity and the original recheck token **9 October, 00:01:52.502 UTC**. Its source clock is genuinely newer than the request. Receipt IDs, content hash and acknowledgement ID are retained in the machine evidence; no raw export is published.

The earlier receipt predates channel capture and has **no explicit `current` channel**. This proves a real prior OPEN_NOW → WATCH/CLOSED → same identity → exact acknowledgement → unavailable-preview chain. It does not prove an explicitly labelled current-channel export, deliberate execution of that specific request by the Pi, or cursor exhaustion. Preserve those remaining distinctions when closing V3-001.

There are **62 acknowledgement ledger rows referencing the 119 lifecycle receipts**, all with source clocks fresh enough for their original request tokens. The remaining receipts must not be mass-acknowledged merely because delivery succeeded.

## Safety and remaining work

The full read-only preservation comparison covered **15,811 retained receipts, 108,819 original facts and 7,077 existing identities**: zero destructive mutations or identity changes. Customer projection and publication queue rows were zero; publication access remained denied. Paid queries today were zero, bulk acquisition remained disabled, live Pitchlist deployment was unchanged and V2 schedules stayed empty/unchanged.

Queue observation at 12:22 London: five due jobs, zero leased and zero dead. This is a single observation, not proof of continuous backlog health. No jobs were drained, deleted or reclassified by this inspection.

Claude retains V3-001. Their 12:22:06 London handover at `26df0611` reports the cursor-paging/exact-ack kit built, with 89 Python and three runner tests passing, awaiting Chris's Pi installation. Obtain the actual installed-kit/full-page execution evidence and retain an explicit lifecycle trace with the missing producer-side steps. The six equal-clock exceptions need stronger evidence, not relaxed provenance rules. V3-003 source custody and Chris's earlier running-kit hash confirmation are recorded in the hub; neither proves the newer paging kit is installed.

No deployment, paid query, mail send, publication, production cutover, subscriber migration or V2 write occurred in this checkpoint.
