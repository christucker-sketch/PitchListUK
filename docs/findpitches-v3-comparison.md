# Equivalent-input V2/V3 evaluation

The original V2 `structured_source_pilot_100_v1` ledger was recovered on 6 October 2026 using fixed **SELECT-only** queries against V2 shadow. No V2 records, code, Workers or infrastructure were changed. All 100 IDs, nine preserved source fields, evidence/provenance and staged revision hashes matched the pinned Git artifact. Historical comparison now uses that actual pilot.

The clock is the ledger's audit time: **5 October 2026, 20:36:44 BST** (`2026-10-05T19:36:44.000Z`). V3 was evaluated offline with that clock and equivalent reconstructed inputs. This is a historical quality comparison; SQLite timings are not Cloudflare throughput measurements. Original export-file bytes are unavailable; equivalence is verified through staged revisions and preserved baselines.

The [dataset](../operations/findpitches-v3/datasets/woodchipper-pilot-2026-10-05/manifest.json) includes real inputs, the read-only capture, measured V2/V3 snapshots, review templates and a [scoring report](../operations/findpitches-v3/datasets/woodchipper-pilot-2026-10-05/comparison.json).

| Source field retained exactly | V2 audit | V3 frozen-clock evaluation |
| --- | --- | --- |
| Title | 12 / 100 | 100 / 100 |
| Supplied organiser | 4 / 90 | 90 / 90 |
| Precise application URL | 7 / 100 | 100 / 100 |

V2 had 23 validated, 69 rejected, one held and seven discovered. V3 assessed 100 eligible, produced 80 ready/20 blocked, retained all **1,250 provided source fields**, and replayed 100 duplicates with zero new entities. Both the earlier reconstructed control and the recovered actual pilot pass adverse extraction proposals with zero destructive mutations.

V2's 69% rejection relative to source-provided usable states is a **source-relative diagnostic**, not verified false rejection. Independent truth review remains required. Ten organisers were missing at source, so the supplied-organiser denominator is 90. The historical 86/100 organiser changes include those missing baselines and measure something different.

Only title, organiser and application URL were audited as historical selected fields. Others remain unobserved. V2 readiness/replay/cost and false-rejection truth are unavailable. The report compares matched per-field retention and refuses an aggregate delta across different field coverage. It makes no overall superiority or cutover claim.

## Reproduction

```bash
node operations/findpitches-v3/pilot-snapshot.mjs \
  --capture operations/findpitches-v3/datasets/woodchipper-pilot-2026-10-05/v2-pilot-reference.json \
  --dataset operations/findpitches-v3/datasets/woodchipper-pilot-2026-10-05
node operations/findpitches-v3/evaluate-dataset.mjs \
  --dataset operations/findpitches-v3/datasets/woodchipper-pilot-2026-10-05 \
  --v2 operations/findpitches-v3/datasets/woodchipper-pilot-2026-10-05/v2-snapshot.json
```

These use ephemeral V3-only SQLite and local reference files, without contacting V2/search providers. Snapshots/reports regenerate; inputs/manifest remain fixed.

For a new real export, `evaluation-dataset.mjs --input <export> --out <new-directory> --as-of <ISO-time>` freezes inputs/hashes/clock without overwriting existing data. `evaluate-dataset.mjs` measures V3 and unchanged replay. Supply measured V2 results with `--v2` and reviewed labels with `--gold`. External isolated offline V2 evaluation or retained audits can supply results. Never benchmark in live V2 or retimestamp historical outputs to imply alignment.

## Scoring and review

Strict scoring checks dataset/per-record hashes, producer IDs, clock and scope. Duplicate IDs, missing/unexpected rows, changed hashes and unmeasured templates prevent a comparable result. Missing actual outputs count against preservation/yield; explicitly unobserved historical fields remain unavailable.

Scores cover per-field retention/completeness, labelled field accuracy, advisory page-fragment/date flags, eligibility coverage, false rejection, unassessed eligible loss, readiness yield, replay entity growth and labelled duplicate accuracy/false merges/false splits. Advisory flags are not truth. Costs/throughput remain null without equivalent measured runs.

Fill `gold-template.json` after independent review. Labels need `reviewed_by`, `reviewed_at` and evidence `references`. Fields use `{value, alternatives?}`; duplicate pairs use `{left, right, same_entity}`. Leave uncertain eligibility null. Neither source states nor pipeline output automatically become gold. Field accuracy/verified false rejection stay null without matching reviewed truth.

`v2-snapshot-template.json` is a blank contract, not measured output; the harness rejects its unmeasured rows. Finish independent review, duplicate cases and cost measurements before proposing cutover.
