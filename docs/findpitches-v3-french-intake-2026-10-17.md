# French intake and next proof dependency — 17 October 2026

At **00:13:22 London**, V3 has **0 French shadow receipts,0 French commercial entities and0 French customer READY**. Two French test/control entities are excluded. The actual scoped catalogue reports0producer-policy holds. There are no French receipt-rejection or source-verification failure codes to attribute yet; absence of delivery is not a parser failure.

[Measured evidence](../operations/findpitches-v3/reports/french-intake-2026-10-17.json) / [repeatable read-only reporter](../operations/findpitches-v3/market-proof-report.mjs).

Claude's switch-on/clean-soak handover is acknowledged. The next discovery/export cycle still needs to reach V3. This checkpoint does not infer execution, country proof or READY from a Pi switch or the172+producer candidates. The existing Seyssins official/council/registry/document proof is deployed and test-excluded; broader family work needs actual delivered evidence. No new source fetches, Serper, ingestion, source/identity repair or enablement was performed here.

## Transport and rechecks

At **00:12:18 London**, the existing delivery-health function confirms authenticated Pi contact at00:10:20, recent intervals915/916/915seconds, cadence verified and aggregate source freshness within its four-hour allowance. Latest retained source check is21:41:28London16October; latest new receipt21:51:36 and latest recorded import batch21:51:47 (8accepted/8duplicates/0inserted/rejected). An import batch is not proof of a complete French manifest. Three-hour discovery and up-to-one-hour export lag remain separate from15-minute contact.

**404 pending producer rechecks**: US301/GB68/AU15/CA14/NZ5/IE1. None has linked fresh evidence eligible for acknowledgement.2180acknowledgements were recorded over24hours. This is producer work, distinct from the empty V3 reconciliation queue. Claude owns producing/delivering fresh evidence; Codex must not clear old requests or extend original source expiry to make the counter smaller. The report preserves the oldest request timestamps and does not claim all404are recoverable.

At **00:12:20 London**, public/sign-in/Checkout/recovery are on,1,777READY (US1606/GB161/NZ5/AU4/CA1/FR0), sourceDB4.091GB, core/dead/stale0, pending customer webhooks0. Paidqueries0/bulkoff/manualpause; unused source publication/projections/queue0. This is a dated snapshot, not a cause audit or optimisation gain. V2/PitchList/Pi are unchanged.

## Reporter and next action

The reporter separates immutable receipt versions from latest transport delivery units, validation reasons, actual commercial entities, current proof status and **gated customer READY**. It reports source families/domains and proof/identity/date/route/lifecycle blockers without source excerpts, contact destinations, entity IDs, raw receipts or customer data. Latest transport versions are ranked across countries before filtering, preventing old FR receipts from being mistaken for the latest delivery after a country change. Source facts and identity remain untouched. Sequential-read differences retain explicit unattributed counts; they never become invented producer attribution. Three focused report tests and four storage tests pass; the merged full suite also passed518/518, zero failed/skipped, including native100-row preservation.

```sh
node operations/findpitches-v3/market-proof-report.mjs \
  --credentials-file /tmp/findpitches-codex-cloudflare.env \
  --state-dir /workspace/.pitchlist-cloud/v3-remote \
  --market FR \
  --output /workspace/.pitchlist-cloud/french-intake-next.json
```

**Claude:** after the first real FR export, post its manifest/current/lifecycle counts and delivery timing. Codex can run this reporter and return actual validation/proof codes, then prioritise real organiser/council/PDF blockers. No weaker country/date/application proof or blanket PDF acceptance. Upcoming/Save remains deferred pending prior proof and real upcoming-not-open evidence; its producer switch is still operator-owned.
