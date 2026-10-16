# Storage checkpoint and pending verdict — 17 October 2026

At **00:07:35 London**, the source D1 is **4,090,884,096 bytes /40.91%**, with5.909GB remaining. State remains normal;70/80/90/97% thresholds are unchanged. This operator work made no runtime/configuration/schema/source/customer/Pi/V2 changes and no paid queries.

The actual **38.25-hour** interval (15October09:45→17October00:00London),154samples, grew367,042,560bytes, a raw net **230.30MB/day**. This is not the48/72h verdict. At this raw rate only,70%warning is12.63days away and97%stop24.36days; these are scenarios, not steady-state forecasts.

[Evidence](../operations/findpitches-v3/reports/storage-followup-2026-10-17.json) / [read-only reporter](../operations/findpitches-v3/storage-growth-report.mjs) / [known change ledger](../operations/findpitches-v3/reports/storage-change-events-2026-10-16.json).

## Separate fixed changes from continuing growth

The recorded index/read-model migration windows added **20,733,952bytes** in total (0025:3,796,992;0026:8,589,312;0027:8,347,648). These windows include concurrent source activity, so simply subtracting their byte totals would invent pure attribution.

The reporter now excludes complete sample intervals overlapping declared changes, allowing15minutes of timestamp uncertainty either side. Overlapping events exclude an interval once. Six intervals/1.5hours are excluded here. The retained36.75hours grew331,837,440bytes, a **216.71MB/day event-excluded net rate**. This is still material ongoing growth and is not proof of pure organic attribution or sustainable unrestricted expansion. Four focused tests pass, including overlapping changes, missing future coverage and retained reclaim. The deployed runtime remains the513-test verified release; this is operator tooling only.

## Exact remaining dependency

Actual48h coverage is due **17October09:45London**,72h **18October09:45London**, against the same anchor. Existing automatic quarter-hour sampling continues. No migration/deletion/sharding is started. Publish the measured verdict after those observations exist; retain source-fact/provenance sharing as the primary design priority if the measured growth remains high.

For a cheap interim check, run the command below with the existing secure credentials/state paths. It reads only aggregate capacity/samples and explicitly skips expensive table payload scans. Omit `--samples-only` and add `--baseline operations/findpitches-v3/reports/storage-growth-2026-10-16.json` for the due full logical-payload comparison.

```sh
node operations/findpitches-v3/storage-growth-report.mjs \
  --credentials-file /tmp/findpitches-codex-cloudflare.env \
  --state-dir /workspace/.pitchlist-cloud/v3-remote \
  --since 2026-10-15T08:45:00Z \
  --change-events operations/findpitches-v3/reports/storage-change-events-2026-10-16.json \
  --samples-only \
  --output /workspace/.pitchlist-cloud/storage-growth-next.json
```

Proceed to the next independent ordered task while elapsed-time coverage is pending; do not fabricate a completed soak, wait blocking for hours, or start a premature migration.
