# V3 Serper safeguards and attribution

Paid bulk acquisition is disabled in both Worker configuration and the V3 policy row. The configured daily ceiling is 1,000, not permission to run acquisition. The previous single-query Austin canary grant is revoked; no additional paid canary is needed to verify protection.

Every paid request atomically reserves one query and one conservative credit budget unit before dispatch. The same controls apply to bulk runs and explicitly granted canaries:

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
