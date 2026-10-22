# Morning status — 22 October 2026

Customer inventory measured **09:13:54 London**; read-only public/Checkout configuration checks at09:14–09:20. [Aggregate evidence](../operations/findpitches-v3/reports/morning-status-2026-10-22.json) · [current execution queue](../team/CURRENT_EXECUTION_ORDER.md).

**UK205 / global1714. No new customer READY since yesterday's11:59 checkpoint;26 withdrawals.** The comparison covers the measured checkpoint window, not a complete reconstructed calendar-day ledger.

| Country | Previous READY | Current READY | Net |
|---|---:|---:|---:|
| UK | 207 | 205 | −2 |
| US | 1,522 | 1,499 | −23 |
| France | 1 | 0 | −1 |
| Australia | 4 | 4 | 0 |
| New Zealand | 5 | 5 | 0 |
| Canada | 1 | 1 | 0 |
| Total | 1,740 | 1,714 | −26 |

All26 withheld entity IDs still exist. Their **current** reasons are: eight US applications past deadline/closed, one US cancellation/postponement, six US selected-location disagreements, six US applications no longer proved, one US organiser disagreement and one US event-date disagreement; two UK Hummingbird source-document binding failures; and the French source returningHTTP521. These current reasons do not reconstruct every record's first transition or prove all14 US field/application holds are genuinely unusable events. The latter need source-backed review.

The two UK withdrawals were existing IDs whose earlier customer visibility was unproven, not members of the47-new CJS cohort. UK remains **+59 over the146 baseline:47 genuinely new CJS + eight confirmed Hummingbird recoveries + four existing IDs with unproven prior visibility**. No new identities or recoveries became READY during this follow-up window.

## Renewals worked; complete24h retention is still pending

- **CJS47/47 remain customer-ready after23.55h** as a complete cohort; **46 have new verification rows from automatic renewals**. One remains on its original valid proof during daily backoff. Its proof expires **today09:32London**; its recorded retry is later. It may therefore be withheld before the complete-cohort24h observation at **09:40London**. Do not claim24h success or extend its source clock to meet the target.
- All **three newly converted LocalStalls records remain READY**. The fourth organiser-mismatch case stays held.
- The two Hummingbird failures retain `hummingbird_source_document_binding_required`. Read-only archive decoding confirms their negative envelopes contain no supporting documents; those receipts do not identify the underlying HTTP failure or prove a changed calendar. No speculative field/calendar repair was applied.
- Core reconcile/eligibility/enrichment/readiness due/leased/dead queues are clear. Expired cached-READY positive-proof gaps are0 at09:16. Compared CJS and LocalStalls original fact/receipt/identity scopes have0 destructive changes.

## Main blocker: fresh producer output

Authenticated Pi polls continue about every15.5min; latest09:09London, cadence verified. **Last import finished yesterday13:02London; latest retained source-check timestamp is yesterday12:42London**, over20h before this check. No later import batch is recorded. The last observed import batches were accepted duplicate replays, not rejected uploads. This is evidence that the transport poll is alive while discovery/export freshness is not advancing; the cloud cannot determine whether acquisition is paused, failing, running too long or failing to regenerate an export.

Producer-scoped pending rechecks are **1087**, includingUS965/UK42;0 have fresh accepted evidence eligible for acknowledgement. The final published21Oct JSON baseline is **239**, so the comparable increase is **848**. Yesterday's230 prose referred to an earlier observation; it should not be used as the final same-checkpoint baseline. No requests were cleared by Codex.

Claude's newest hub commit prepares **kit012a (`1ff616af`)**, superseding011z; its LocalStalls gate and host installation are not evidenced. Claude owns the producer/host work. The next producer action is a real host check of acquisition state, latest completed cycle, export modification/source-check clocks, errors and installed kit—not another unverified cloud promotion. Both BRIX hosts and UKCF OptionB remain off.

## Service and spend

Public health returned200/production-public. Read-only plans returned200 with global LIVE Checkout enabled; no customer, mail or Stripe transaction was created. **No V3 Serper usage rows on21/22Oct; paid manually paused/bulk off.** This is not an account-wide provider/legacy spend audit. Unused source publication/customer projection/publication queue remain0. This check made0 direct source-site GETs and0 runtime/Pi/V1/V2 changes; existing public and billing configuration was preserved. Full tests were not repeated for a read-only status update; last implementation acceptance remains571passed.
