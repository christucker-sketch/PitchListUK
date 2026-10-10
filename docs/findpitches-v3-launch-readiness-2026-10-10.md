# FindPitches V3 — launch-readiness acceptance matrix

Owner: ChatGPT / V3-010  
Date: 2026-10-10  
Status: **CONDITIONAL-GO candidate for a controlled V3 launch only after the remaining launch-critical evidence closes.** This document is review/planning evidence, not operator approval and not authorization to publish, bill, migrate subscribers, change domains, send customer messages or start paid acquisition.

## Executive position

V3-004 and V3-005 have removed the two largest customer-side engineering risks. Existing-subscriber recognition is implemented and tested in synthetic TEST scope, and one genuine browser journey has completed native sign-in -> Stripe-hosted Checkout -> Pro entitlement -> hosted cancellation -> paid-through access -> ended Free/redaction with 22/22 checks. The remaining launch-critical technical proof is V3-001 final lifecycle/identity verification, plus bounded real-origin operational checks before any public cutover.

The project is therefore no longer in a rebuild phase. It is in evidence, cutover and rollback preparation.

Three approval gates must remain separate:

1. **Controlled V3 launch** — public/customer routing to V3 under a bounded plan.
2. **Real-subscriber migration / live billing** — canonical LIVE provider verification, reviewed migration cohort and explicit billing approval.
3. **Paid acquisition** — separate commercial/spend approval after launch behaviour and attribution are proven.

Passing Gate 1 does not imply Gates 2 or 3.

## Acceptance matrix

| Area | Current status | Evidence / assessment | Required before gate |
| --- | --- | --- | --- |
| V3 runtime independence | GREEN | V3 customer/auth/billing runtime is native; V1/V2 customer APIs/KV/cookies/databases are not runtime dependencies in the recognition design. Standalone frontend independence checks have passed. | Preserve this through cutover; no emergency dependency on V1/V2 may be introduced. |
| New-customer hosted billing journey | GREEN in TEST | Genuine hosted Stripe TEST journey passed 22/22 through trial, active Pro, hosted portal cancellation, paid-through access and ended Free/redaction. | Separate explicit approval is still required before LIVE billing. |
| Duplicate trial / duplicate charge protection | GREEN in TEST | Recognition guards, immutable associations, Checkout reservation/database protections and returning-account UI guards are implemented and tested. | Re-run bounded preflight against the release candidate before LIVE billing. |
| Existing-subscriber recognition design | GREEN for synthetic acceptance | Exact canonical owner/customer/subscription association, no email-only match, replay/concurrency protection and rollback review are defined and tested. | Does **not** authorize real migration. |
| Real existing-subscriber continuity | RED / gated | UK registry read-only audit found 57 rows; all 57 lack retained canonical provider mode/product/price/period-end coverage, and 8 lack exact vendor-profile binding. | Authorized read-only LIVE provider snapshot/checks; approved legacy price/product policy; reviewed exceptions; full cohort reconciliation; explicit operator migration approval. |
| Lifecycle / freshness integrity | AMBER, near close | All-page Pi handoff works. Three of six targeted conflicts have genuinely newer evidence; the other three are valid state/identity transitions (past/not-relevant, replacement id, merged identity), not retry failures. | Codex final ledger verification of all six and retained end-to-end lifecycle trace; V3-001 marked DONE. |
| Identity continuity / dedupe | AMBER | Initial 119 lifecycle receipts linked to existing identities with zero customer visibility; latest three non-refresh cases now require final V3-side identity resolution confirmation. | Confirm no duplicate customer-visible opportunity and correct canonical survivor/withdrawal handling for all three identity cases. |
| Customer preview / browser behaviour | AMBER | Hosted billing path and ended-account UI were exercised at the real private origin. | Complete bounded V3-008 checks: latency, sign-in, search, geography/facets, Pro gating, redaction and obvious browser/security regressions. |
| Publication safety | AMBER | Publication API remains denied; customer projection/publication rows remained zero in preservation audits. | Define exactly which publication switch/route changes occur at cutover; preflight and post-cutover counts; rollback switch proven/documented. |
| Domain / routing cutover | AMBER | Private preview exists; no production custom-domain cutover has been authorized. | Operator-approved routing plan, exact DNS/Cloudflare change set, health checks, rollback target and propagation/verification steps. |
| Rollback | AMBER | Subscriber rollback principles are documented: stop migration/live Checkout, revoke affected V3 sessions if needed, preserve immutable ledgers, serve protected V1 routing. | One concrete operator runbook with trigger thresholds, exact routing rollback and ownership for execution. No destructive rollback. |
| Monitoring / operations | AMBER | Preservation and test evidence are strong; no final launch monitoring pack yet. | Define launch watch: health/API errors, auth failures, Checkout/webhook failures, customer snapshot count, lifecycle lag, producer delivery age, publication count and rollback thresholds. |
| V1 protection | GREEN | Repeated audits show live UK Pitchlist/V2 unchanged; no source/identity destructive mutations or paid queries from this work. | Keep V1 protected until post-cutover acceptance and explicit retirement decision. |
| Alerts / outbound email | NOT A LAUNCH BLOCKER while disabled | Native mail binding validated with zero sends; V3-006 remains open. | Keep alerts disabled unless separately approved and tested. |
| UKCraftFairs Option B | NOT A LAUNCH BLOCKER | Source-document path prepared off-by-default; enquiry policy D-012 exists. | Decide after launch-critical closure unless it becomes a genuine commercial blocker. |
| Paid acquisition | RED / held | Bulk off and paid usage remains gated. | Separate V3-009 attribution/account-protection evidence plus explicit budget/spend approval. |

## Controlled cutover sequence — draft only

This is the shortest safe sequence I recommend once V3-001 and V3-008 are clean. It deliberately avoids coupling public routing, legacy-subscriber migration and paid acquisition into one irreversible event.

1. **Freeze the release candidate.** Record commit/deployment ids, Worker versions, schema/migration state, producer delivery health, inventory/customer snapshot counts and current V1 routing. No feature work during the cutover window.
2. **Run release preflight.** Full V3 suite, focused auth/customer/billing checks, standalone frontend checks, lifecycle freshness check, producer delivery age, publication queue/count, mail-send disabled state and preservation audit.
3. **Confirm Gate 1 scope.** Chris explicitly approves the exact public/custom-domain routing change. Unless separately approved, keep LIVE billing, real-subscriber migration, alerts and paid acquisition disabled.
4. **Apply the smallest routing/domain change.** Point only the approved customer/public route(s) at the frozen V3 release. Do not delete or repurpose V1/V2 infrastructure.
5. **Immediate smoke test from the real origin.** Homepage/search, sign-in, geography/facets, free redaction, Pro gating behaviour appropriate to the approved scope, API health and no unintended customer/source leakage.
6. **Observe a bounded acceptance window.** Compare health/error rates, lifecycle age, customer snapshot counts, publication counts and producer delivery against the frozen baseline. Any unexplained identity/customer/billing anomaly is a stop condition.
7. **Only after Gate 1 stabilizes, consider Gate 2.** Real subscriber migration/LIVE billing requires its own reviewed manifest, canonical LIVE Stripe checks, approved product/price policy, dry-run reconciliation and explicit Chris approval. Do not use a new subscription or trial as a fallback for an unrecognized legacy customer.
8. **Paid acquisition remains Gate 3.** Do not restart spend until V3-009 attribution/account-protection is complete and post-launch conversion/quality monitoring exists.

## Rollback sequence — draft only

Rollback must prefer routing reversal and feature disablement over data deletion.

1. Trigger rollback for material auth/sign-in failure, customer entitlement error, duplicate billing risk, publication leakage, lifecycle/identity corruption, sustained origin/API failure, or unexplained customer-count divergence.
2. Disable any newly enabled live Checkout/migration/publication switch first if that gate was part of the approved release.
3. Restore the prior protected V1 customer/public routing using the recorded pre-cutover route/configuration. Keep V3 shadow services and evidence intact for diagnosis.
4. Revoke/expire affected V3 sessions where entitlement safety requires it; do not cancel/recreate provider subscriptions as a rollback shortcut.
5. Preserve association ledgers, receipts, source evidence, decision history and failed-release telemetry. Do not silently rebind identities or delete audit history.
6. Verify V1 health, login/access, production routing and customer impact before declaring rollback complete.
7. Publish a short incident checkpoint to the hub with trigger, scope, restored version/routes and any customer/billing follow-up required.

## Current V3-010 recommendation

**Controlled V3 launch: CONDITIONAL-GO, not yet executable.** The conditions are: V3-001 final cloud-side closure; bounded V3-008 real-origin operational checks; a concrete domain/routing change set and rollback runbook; and explicit Chris approval for the exact launch scope.

**Real-subscriber migration / LIVE billing: NO-GO today.** The blocker is not the V3 recognition implementation; it is missing canonical LIVE provider coverage and approved legacy product/price/period-end/exception handling for the selected real cohort.

**Paid acquisition: NO-GO today.** Keep held until V3-009 attribution/account protection plus explicit spend approval and post-launch monitoring.

## Next evidence to fold in

- Codex final V3-001 cloud checkpoint for all six targeted lifecycle/identity outcomes.
- V3-008 bounded real-origin preview report, once claimed/completed.
- Read-only canonical real-subscriber migration-readiness inventory and exception counts.
- Exact production domain/routing proposal and monitoring thresholds before final operator GO/NO-GO.
