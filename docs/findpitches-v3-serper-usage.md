# V3 Serper safeguards and attribution

Paid bulk acquisition is disabled in both Worker configuration and the V3 policy row. The configured daily ceiling is 1,000, not permission to run acquisition. The previous single-query Austin canary grant remains revoked; bounded experiments require the separate grants described below.

Every paid request atomically reserves one query and one conservative credit budget unit before dispatch. The same controls apply to bulk runs, explicitly granted canaries and controlled pilots:

| Limit | Queries | Credit budget units |
| --- | ---: | ---: |
| Per run | 4 | 4 |
| Rolling hour | 100 | 100 |
| Daily | 1,000 | 1,000 |

Daily budgets use Europe/London midnight, including daylight-saving changes. An exhausted daily/hourly window pauses acquisition until its reset. Reservations survive uncertain provider failures, and the same acquisition run cannot be automatically rebilled. A provider-reported charge greater than its one-credit reservation triggers a manual pause requiring review. Request configuration uses the standard search endpoint with ten results.

The append-only usage ledger records producer/lane, market/region, query hash, reservations, attempted/completed counts, dispatch timestamps, HTTP outcome, observable response credits and candidate/receipt counts. Receipt attribution joins the ordinary reconciliation, eligibility and readiness tables. `/status.serper` exposes limits, current liabilities, remaining budget, pause state and recent runs. Existing history is backfilled with retained query counts and explicitly unknown billed credits.

Credit observations are stored only when returned numerically by the provider. Conservative budget units are labelled separately from billed credits. Monetary costs remain null until both observed credits and the account's unit credit price are known; no pricing tier is guessed. Candidate cost uses unique producer candidate IDs, with duplicate occurrences and occurrence cost reported separately. Per-candidate and per-ready fields distinguish absent data and zero denominators. Readiness is the current shared-entity state; later producer evidence may contribute. Ready cost uses newly sourced entities as its denominator and is not a causal claim about search-only yield.

`audit-serper-usage.mjs` reads V2's query-loop counters using fixed SELECTs, reads V3's ledger and optionally uses Serper's account GET endpoint without issuing searches. The audit day is UTC, matching the current environment; the report separately names V3's London budget window. V2 counters reflect attempts, including failures, and sum per-run unique candidates rather than a global deduplicated total. Current candidate dispositions are read separately.

```bash
node operations/findpitches-v3/audit-serper-usage.mjs \
  --credentials /secure/cloudflare.env --state-dir /secure/v3-resources \
  --serper-file /secure/serper.env --out /secure/serper-audit.json
```

No start-of-day balance or V2 per-request credit ledger survives. Exact billed attribution between V2, V3 and other clients therefore remains unavailable; secret binding names also cannot establish that their keys belong to the same Serper account. V3 safeguards govern V3 only. V2's independent scheduler remains untouched.

An optional `--previous-report` compares account balances and retained attempt counters over the same UTC audit window. A net balance decrease is not a billed-credit split: delayed billing, incomplete historical counters and other clients cannot be distinguished. Reports preserve that uncertainty rather than assigning the difference to V2 or V3.

Protection is verified using recorded provider responses, concurrent native D1 reservations, run/hour/day limits, DST resets, uncertain outcomes and excessive-credit pauses. Remote checks confirm disabled acquisition, rejected undelegated canaries and visible budgets while issuing zero paid searches. Keep continuous paid acquisition disabled until measured yield and attribution justify a separate decision.

## Controlled readiness experiment

The acquisition Worker now has separate operator-only `/acquisition/pilot/start`, `/acquisition/pilot/next` and `/acquisition/pilot/stop` routes. The ingest-only producer credential cannot call these routes. A pilot grants at most 240 queries from a fixed, geographically diversified plan, with a separate 250-query/credit daily ceiling counting all V3 reservations that day. The global 4/run, 100/hour and 1,000/day limits remain enforced atomically. Two queries per pilot run, one unsettled run at a time, immutable grants, one session per London budget day, and expiry within three hours or local midnight prevent a grant from becoming continuous acquisition. Paused sessions cannot reopen, uncertain outcomes cannot rebill, and recently executed query hashes are refused. Bulk configuration and policy remain disabled.

The plan spans 60 reviewed cities and eight markets, with distinct country context in every query. Market/region telemetry describes acquisition scope, not verified source geography. A search result creates immutable snippet evidence with UNKNOWN application state; query city is never copied into venue/location. Reconciliation and readiness still use the normal evidence rules.

After a 12-query warm-up, the next run is refused if new-ready yield is below 0.1/query, new-entity yield is below 0.5/query, or exact-match duplication exceeds 60%. Any core queue exceeding 40 due jobs or 120 seconds of age, failed paid run, failed preservation gate or customer/publication leakage pauses the experiment. These are conservative experiment thresholds, not measured operating targets. Admission waits for the previous run's reconciliation and current readiness revisions to settle. Safety checks repeat before every paid dispatch. `/status.controlled_pilot` shows grants, session state, automatic stop reason, funnel metrics and limits; per-run Serper telemetry also includes new entities, matches, duplication and queries/credits per new ready entity.

`controlled-pilot.mjs` is an explicit operator runner, not a scheduler. It fingerprints all existing raw receipts and source facts before paid work and between settled runs, checks appended evidence on subsequent runs, and pauses on any deletion/change. It checks final leakage and retains aggregate reports outside the checkout. A near-midnight start waits for the next London budget day instead of fragmenting the warm-up across daily windows. Null cost/ready values mean pricing is unavailable or no new entity is ready; they never mean a zero acquisition cost.

```bash
node operations/findpitches-v3/controlled-pilot.mjs \
  --credentials /secure/cloudflare.env --state-dir /secure/v3-resources \
  --out-dir /secure/readiness-pilot
```

The 250 ceiling is an upper bound for an explicitly authorised experiment, not a spend target or a standing permission to enable paid bulk acquisition. A poor-yield stop requires source-quality review before any later experiment.
