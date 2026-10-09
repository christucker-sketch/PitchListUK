# Legacy paid-acquisition incident and recovery — 9 October 2026

The earlier stop missed a separate acquisition engine. V2's scheduler was removed, but the legacy global UK controller remained enabled and continued paid discovery. The audit found no recent re-enable of that controller. The successful retained UK discovery outputs report 6,192 paid query units and zero published opportunity additions through its operator-approved pause at **10:44 London on 9 October**. This spend has not demonstrated commercial value.

## Cause and spend

Cloudflare audit history records V2's scheduler removal at 6 October 12:40 London. Its retained last paid US run is dated 6 October 16:35 London; no later paid runs survive for any V2 market. The available receipts do not establish why retained activity extends beyond scheduler removal. V2's scheduler is currently empty.

The separate global Worker was deployed on 2 October and continued its every-minute shared scheduler. Its UK controller enable flag remained true. Each ordinary completed discovery combined four source-discovery queries and eight opportunity queries: twelve paid units, despite the controller's nominal query limit of four. V3 budgets and automatic yield stops do not govern this engine.

The sealed workflow window is **6 October 00:00–9 October 10:44 Europe/London**. Workflow creation dates attribute the daily figures; actual provider request timestamps and billing may differ.

| London date | Completed reported paid units | Failed discovery workflows | Acquisition workflows | Published additions |
| --- | ---: | ---: | ---: | ---: |
| 6 October | 1,008 | 107 | 83 | 0 |
| 7 October | 2,244 | 0 | 185 | 0 |
| 8 October | 2,028 | 0 | 170 | 0 |
| 9 October, through pause | 912 | 0 | 76 | 0 |
| **Total** | **6,192** | **107** | **514** | **0** |

There were 516 completed and 107 failed UK discovery workflows. The successful outputs also report zero approved-source additions. Failed discovery steps/retries may have incurred additional credits; 6,192 is a retained successful-output estimate, not provider-observed total billing.

V3 retains 25 query attempts/completions in the original morning audit window: 24 provider-observed credits and one older canary with unknown credit observation. It used zero paid queries on 8 or 9 October. V2 retains 1,600 query attempts on 6 October and none later; these are attempts, not observed billed credits. Binding names cannot prove account-key equality. Do not add these figures together as an exact billed split of the user's approximate 6,400 credits.

The observed Serper balance fell from 49,215 at 6 October 16:53 London to 43,603 at 9 October 09:31 London, a decrease of 5,612 over that narrower interval. The incident JSON preserves the billing limitations and original observations. After the pause, the balance remained 43,474 between the 11:00 and 11:02 London checks; this is a short observed interval, not an account-wide lock.

## Pause and US follow-up

The user explicitly approved pausing the legacy UK controller and any active UK paid discovery workflows. Its live `GLOBAL_UK_CONTROLLER_CUTOVER_ENABLED` is now false. No UK discovery workflow was active at the pause. Subsequent scheduler checks through 10:59 London found no new UK workflow. The deployed code hash is identical, all thirteen unrelated bindings were preserved, shared scheduling is unchanged and V2's scheduler remains empty. Durable Object classes, namespaces and state were preserved. No publication setting changed.

V2's US acquisition is stopped. The separate legacy global US enable flag remains true, although no US discovery workflows appear in the audited window. A separate US-only pause was presented for authorization because the approved exception covered UK only. The Texas Worker's deployed scheduled handler is manual-only and queues zero acquisition; its latest retained workflow was created in September. No US or Texas setting has been changed by this incident response.

An older legacy deployment configuration still setting controller flags true could re-enable a paused controller. V3 deployment tools target only owned V3 shadow Workers and cannot alter this pause. Account-wide protection must include every legacy, Pi and external paid client before another paid programme is considered.

## What was recovered

All 1,137 UK workflow receipts were archived with SHA-256 custody checks and zero archive read failures, preserving 18,931,730 bytes of returned receipts. Their 816 legacy customer-ready row occurrences collapse to **26 distinct original source routes: 96.81% repeated occurrences**. These historical classifier labels never established V3 READY, and do not represent 816 new opportunities. The recovery scope is the source routes retained in those final outputs; the archive preserves other returned workflow material without asserting that every original search result can be reconstructed.

Direct original-source fetches checked all 26 routes without Serper. The current verifier returned 22 unverified and four quarantined documents, with no verified source proof. Current heading/structured-source reconstruction supported ten bounded evidence receipts. Sixteen routes remained quarantined without a new entity: twelve lacked a defensible specific trading event, two were editorial pages, one fetch failed and one was a platform/index page.

The ten imported `legacy-global-uk` receipts received ten identity decisions:

- **3 matched existing entities**;
- **7 new shadow entities**;
- **0 newly READY opportunities**;
- **10 linked entities currently blocked by source-proof gaps**.

The seven new entities are not customer-ready inventory. Historical query geography, old event dates, open-state flags and publication claims remain evidence metadata rather than current selected facts. The producer stays separate from independent Claude/Pi delivery, V2 legacy recovery and V3 paid-query KPIs.

One material repair risk was confirmed on the Broadstairs source: the old event-date field used an application deadline. The current source describes a March 2027 event with applications opening in late October 2026. That cannot establish an open application now. No unsupported date/state was copied to make the record pass.

## Validation and next action

The full V3 suite passed **164 tests**, with zero failures/skips, including native D1/queue control checks. The V3 boundary check passed. The eight owned V3 shadow Workers were deployed without live routes or publication enablement.

The live preservation audit compared **15,215 existing producer receipts and 102,046 source facts**, with zero destructive mutations, zero existing identity mutations and zero missing existing entities. Recovery added zero Serper queries, zero customer rows and zero publication rows. Replaying all ten receipts produced ten duplicates, unchanged receipt/entity counts and zero source mutations. The ingest-only producer token received HTTP 401 on the operator-only recovery route. No due reconciliation/eligibility/enrichment/readiness jobs remained at the final replay check.

Keep V3 paid acquisition disabled. The most useful unpaid follow-up is source-specific verification of retained official application routes, rather than repeating these searches. Any further paid work needs account-wide attribution/protection and proof of READY yield; high repeated candidate counts do not justify spend.

Evidence: [incident attribution](../operations/findpitches-v3/reports/legacy-paid-incident-2026-10-09.json), [recovery outcomes](../operations/findpitches-v3/reports/legacy-paid-recovery-2026-10-09.json), and [recovery operator guide](findpitches-v3-legacy-paid-recovery.md). Raw receipts, documents, credentials and operator state remain in restricted storage outside Git.
