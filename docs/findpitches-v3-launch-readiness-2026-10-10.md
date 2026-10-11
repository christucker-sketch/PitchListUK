# FindPitches V3 — launch-readiness acceptance matrix

Owner: ChatGPT / V3-010  
Updated: 2026-10-11  
Status: **CONDITIONAL-GO candidate for a controlled V3 launch only after the remaining launch-critical evidence closes.** This document is review/planning evidence, not operator approval and not authorization to publish, bill, migrate subscribers, change domains, send customer messages or start paid acquisition.

## Executive position

V3-004, V3-005 and V3-008 have now removed the main bounded customer-side correctness blockers. Existing-subscriber recognition is implemented and tested in synthetic TEST scope; one genuine browser journey completed native sign-in -> Stripe-hosted Checkout -> Pro entitlement -> hosted cancellation -> paid-through access -> ended Free/redaction with 22/22 checks; and the restricted real-origin preview passed API 39/39 plus browser 30/30 checks.

The remaining launch-critical technical dependency is now **V3-001 final cloud-side closure of the three audited lifecycle/identity cases** (Pop Up Shops, From the Ground and Nashville). Claude's producer-side evidence is complete. Codex must confirm the V3-side resolution and customer visibility for those three without fabricated source evidence or silent cross-edition merging.

The other Gate-1 work is operator/release preparation rather than core product correctness: exact production routing scope, frozen preflight baseline, monitoring/rollback thresholds and explicit approval.

Three approval gates remain separate:

1. **Controlled V3 launch** — public/customer routing to V3 under a bounded plan.
2. **Real-subscriber migration / LIVE billing** — canonical LIVE provider verification, reviewed migration cohort and explicit billing approval.
3. **Paid acquisition** — separate commercial/spend approval after launch behaviour and attribution are proven.

Passing Gate 1 does not imply Gates 2 or 3. V3-011 international expansion (IE/CA/AU/NZ) is commercially important supply work but is **not** a Gate-1 launch blocker.

## Acceptance matrix

| Area | Current status | Evidence / assessment | Required before gate |
| --- | --- | --- | --- |
| V3 runtime independence | GREEN | V3 customer/auth/billing runtime is native; V1/V2 customer APIs/KV/cookies/databases are not runtime dependencies in the recognition design. Standalone frontend independence checks passed. | Preserve through cutover; no emergency V1/V2 runtime dependency may be introduced. |
| New-customer hosted billing journey | GREEN in TEST | Genuine hosted Stripe TEST journey passed 22/22 through trial, active Pro, hosted portal cancellation, paid-through access and ended Free/redaction. | Separate explicit approval is still required before LIVE billing. |
| Duplicate trial / duplicate charge protection | GREEN in TEST | Recognition guards, immutable associations, Checkout reservation/database protections and returning-account UI guards are implemented and tested. | Re-run bounded release-candidate preflight before any LIVE billing approval. |
| Existing-subscriber recognition design | GREEN for synthetic acceptance | Exact canonical owner/customer/subscription association, no email-only match, replay/concurrency protection and rollback review are defined and tested. | Does **not** authorize real migration. |
| Real existing-subscriber continuity | RED / gated | Read-only UK registry audit found 57 rows; all 57 still require canonical LIVE owner/mode/product/price/period-end evidence, eight have vendor-binding exceptions and four scheduled-cancellation continuity cases need review. | Authorized read-only LIVE provider evidence; approved legacy product/price policy; reviewed exceptions; full cohort reconciliation; explicit migration approval. |
| Lifecycle / freshness integrity | AMBER, final dependency | Three genuinely refreshed cases are independently verified and acknowledged. Claude has supplied producer-side evidence for the three non-refresh cases: past/not-relevant, same-edition retired replacement never delivered, and reviewed Nashville supersession candidate. | Codex final V3-side resolution/sign-off for Pop Up Shops, From the Ground and Nashville; then V3-001 marked DONE. |
| Identity continuity / dedupe | AMBER, final dependency | Initial lifecycle receipts linked to existing identities with no customer leakage. Producer evidence now names the From the Ground replacement and retains both Nashville anchors. | Codex confirms no duplicate customer-visible inventory, correct obsolete-request handling and reviewed Nashville survivor relationship without silent edition merge. |
| Customer preview / browser behaviour | GREEN in bounded preview scope | V3-008 passed API 39/39 and browser 30/30 at the real restricted origin, covering sign-in, search, geography/facets, Pro gating, redaction, mobile, security headers/cookies/noindex and same-origin assets. | Repeat a compact smoke set against the frozen release candidate immediately before and after cutover. |
| Performance / boot latency | AMBER release concern | V3-008 measured catalogue API median about 4.1s, sampled p95 about 5.1s, browser readiness 4.2–20.2s under proxy/interception with cache disabled. This is not production-load evidence. | Bounded catalogue/boot profiling plus release monitoring. No need to block solely on the proxy result unless profiling exposes a structural failure. |
| Publication safety | AMBER | Publication API remains denied; preservation audits show zero customer/publication leakage. | Exact publication/routing scope must be declared before launch. If Gate 1 is routing-only, publication must remain disabled and any publication row/event is a stop condition. |
| Domain / routing cutover | AMBER | Private preview exists; no custom production domain/route has been authorized. | Before GO record the exact hostname(s), Cloudflare Worker/route/record to change, current target, new target, TTL/propagation expectation, and one-command/one-change rollback path. Preserve V1 routing unchanged until acceptance completes. |
| Rollback | AMBER, runbook drafted | Rollback principles are defined: reverse routing first, disable new features, preserve V3 evidence/ledgers, avoid destructive customer/provider changes. | Final operator runbook must name exact routing objects and owner; trigger thresholds below become the launch watch. |
| Monitoring / operations | AMBER, thresholds drafted | Preservation, queue, preview and producer evidence are strong; off-site producer backup is now configured and proven. | Freeze a preflight baseline and monitor the thresholds below during the acceptance window. |
| V1 protection | GREEN | Repeated audits show live UK Pitchlist/V2 unchanged; no destructive source/identity mutations or paid queries from this work. | Keep V1 protected and immediately restorable until post-launch acceptance plus separate retirement decision. |
| Alerts / outbound email | NOT A LAUNCH BLOCKER while disabled | Native mail binding validated with zero sends; V3-006 remains open. | Keep alerts disabled unless separately approved and tested. |
| UKCraftFairs Option B | NOT A LAUNCH BLOCKER | Source-document path remains off-by-default; D-012 route policy exists. | Claude recommendation after V3-001 closure; explicit Chris approval required before enablement. |
| International expansion V3-011 | NON-GATING COMMERCIAL WORK | Claude is expanding IE/CA/AU/NZ; Codex is assigned ClueMart proof parsing plus per-source blocker diagnostics. | Track READY gained by country/source; do not delay controlled launch purely for raw inventory growth. |
| Paid acquisition | RED / held | Bulk off and paid usage remains gated. | Separate V3-009 attribution/account-protection evidence plus explicit spend approval and live monitoring. |

## Controlled cutover sequence — draft only

This is the shortest safe Gate-1 sequence once V3-001 closes. It deliberately avoids coupling public routing, legacy-subscriber migration and paid acquisition into one irreversible event.

1. **Freeze the release candidate.** Record feature-branch commit, Worker versions, schema/migration state, producer delivery health, customer snapshot count, eligible inventory count, queue health and current V1 routing. No feature work during the cutover window.
2. **Record the exact routing object.** Before any GO, document the exact hostname(s) being moved, current DNS/Cloudflare route/Worker target, proposed V3 target and the exact reverse change. If this information is not recorded, Gate 1 remains CONDITIONAL-GO.
3. **Run release preflight.** Full V3 suite; focused auth/customer/billing tests; standalone frontend check; compact V3-008 smoke; lifecycle freshness/producer delivery age; customer/inventory count; queue state; publication disabled state; alerts disabled state; LIVE billing/migration disabled state; preservation audit.
4. **Confirm Gate-1 scope.** Chris explicitly approves only the listed routing/domain change. Unless separately approved, LIVE billing, real-subscriber migration, alerts, paid acquisition and UKCraftFairs Option B remain disabled.
5. **Apply the smallest routing/domain change.** Point only the approved customer/public route(s) at the frozen V3 release. Do not delete, repurpose or merge V1/V2 infrastructure.
6. **Immediate real-origin smoke.** Homepage/search, sign-in, geography/facets, Free redaction, Pro gating appropriate to the approved scope, API health, static assets, security headers and no unintended source/customer leakage.
7. **Observe the bounded acceptance window.** Monitor the release thresholds below against the frozen baseline. Any identity, entitlement, billing or publication anomaly is a stop condition even if general availability looks healthy.
8. **Declare Gate-1 accepted or roll back.** Do not begin Gate 2 during an unstable Gate-1 observation window.
9. **Only after Gate 1 stabilizes, consider Gate 2.** Real subscriber migration/LIVE billing requires its own canonical LIVE provider checks, reviewed manifest, approved product/price policy, dry-run reconciliation and explicit Chris approval.
10. **Paid acquisition remains Gate 3.** Do not restart spend until V3-009 is complete and post-launch quality/conversion monitoring exists.

## Provisional launch monitoring / rollback thresholds

These are release guardrails for the controlled window, not claims about normal long-term SLOs. Freeze the actual preflight baseline immediately before cutover and use both absolute and relative signals.

- **Routing / origin availability:** rollback if the approved hostname cannot serve the V3 homepage/API from an external browser for 3 consecutive probes over ~5 minutes, or if there is sustained 5xx behaviour rather than a transient single failure.
- **API latency:** investigate immediately if catalogue/search p95 is >2x the frozen preflight baseline for 10 minutes; rollback if it is also causing user-visible timeouts/failures. Do not use the proxy-based 5.1s sample as a production SLO.
- **Browser readiness:** investigate if three consecutive clean-browser probes exceed 30s or fail to reach usable search results; rollback if persistent and attributable to V3 rather than the test network.
- **Authentication:** any systemic sign-in failure affecting multiple clean test accounts is a stop condition; isolated user error is not.
- **Entitlement / redaction:** **one reproducible incorrect Pro grant, Free source-link leak, cross-market entitlement leak or paid-through error is an immediate rollback condition.**
- **Billing safety:** while LIVE billing is disabled, any unexpected LIVE-mode Checkout/subscription/webhook activity is an immediate stop/rollback condition. TEST-mode events are not a Gate-1 production signal.
- **Publication safety:** if publication is not explicitly included in Gate 1, any non-zero publication queue/write caused by the release is an immediate stop condition.
- **Identity/lifecycle:** one reproducible duplicate customer-visible opportunity caused by identity resolution, or one closed/withdrawn record incorrectly exposed, is an immediate rollback condition.
- **Producer delivery:** investigate if authenticated delivery age exceeds 45 minutes (three nominal 15-minute delivery intervals); rollback only if the stale feed is producing incorrect customer state rather than a temporary delayed update.
- **Customer/inventory counts:** investigate any unexplained >5% divergence from the frozen eligible/customer snapshot during the short acceptance window. Expected expiry/aging must be separated from release-caused loss.
- **Queue health:** any dead-letter growth or sustained due/leased backlog that starts with the release is a stop condition for further rollout; future watch jobs are not backlog.
- **V1 health:** V1 must remain healthy and routable as the rollback target throughout the controlled window.

## Rollback sequence — draft only

Rollback prefers routing reversal and feature disablement over data deletion.

1. Trigger rollback for material auth/sign-in failure, entitlement error, duplicate billing risk, publication leakage, lifecycle/identity corruption, sustained origin/API failure, or unexplained material customer-count divergence.
2. Disable any newly enabled Gate-1 switch first. LIVE Checkout/migration should still be disabled under the default controlled-launch scope.
3. Restore the recorded prior V1 customer/public routing using the exact pre-cutover route/DNS/Worker configuration. Keep V3 shadow services and evidence intact for diagnosis.
4. Revoke/expire affected V3 sessions only where entitlement safety requires it; do not cancel/recreate provider subscriptions as a rollback shortcut.
5. Preserve association ledgers, receipts, source evidence, decision history and failed-release telemetry. Do not silently rebind identities or delete audit history.
6. Verify V1 health, login/access, production routing and customer impact before declaring rollback complete.
7. Publish a hub checkpoint with trigger, scope, restored route/version, observed metrics and any customer/billing follow-up required.

## Current V3-010 recommendation

**Controlled V3 launch: CONDITIONAL-GO, not yet executable.** V3-008 is now accepted in bounded preview scope. The remaining conditions are: final V3-001 cloud-side closure; exact production hostname/routing object plus reversible change; frozen preflight baseline and launch watch; and explicit Chris approval for the exact Gate-1 scope.

**Real-subscriber migration / LIVE billing: NO-GO today.** The blocker is missing canonical LIVE provider coverage and approved legacy product/price/period-end/exception handling for the real cohort, not the native V3 recognition implementation.

**Paid acquisition: NO-GO today.** Keep held until V3-009 attribution/account protection, explicit spend approval and post-launch monitoring.

**International expansion:** proceed in parallel. V3-011 should be judged by customer-ready listings gained in IE/CA/AU/NZ, but it does not need to hold Gate 1 open.

## Next evidence to fold in

- Codex final V3-001 cloud checkpoint for Pop Up Shops, From the Ground and Nashville.
- Exact production hostname/routing object proposed for Gate 1.
- Codex bounded catalogue/boot profiling findings when available.
- V3-011 READY conversion results by country/source as commercial supply evidence, not launch gating.
