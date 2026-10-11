# FindPitches V3 — launch-readiness acceptance matrix

Owner: ChatGPT / V3-010  
Updated: 2026-10-11  
Status: **SAME-DAY PUBLIC-LAUNCH REVIEW ACTIVE — no launch action authorized.** The current target under review is a public FindPitches service with working subscriptions for new FindPitches customers. PitchList remains a separate live product. This document is planning/review evidence only; it does not authorize public routing, LIVE Stripe changes, charges, customer migration, paid acquisition, outbound messages, UKCraftFairs Option B or protected/live merges.

## Executive position

V3-004, V3-005 and V3-008 have removed the main bounded customer-side correctness blockers. Existing-subscriber recognition is implemented and tested in synthetic TEST scope; one genuine browser journey completed native sign-in -> Stripe-hosted Checkout -> Pro entitlement -> hosted cancellation -> paid-through access -> ended Free/redaction with 22/22 checks; and the restricted real-origin preview passed API 39/39 plus browser 30/30 checks.

Codex's latest checkpoint narrows V3-001 to **one remaining lifecycle case only: Nashville old native 2026 versus survivor 2027**. Pop Up Shops and From the Ground now have audited append-only resolutions, all reviewed identities remain withheld from preview, and the Nashville pair is still withheld pending explicit edition/source custody. This is no longer a general lifecycle-design blocker.

The launch question has also changed materially: **PitchList V1 is a separate product/site and is not the service being replaced by FindPitches.** A FindPitches launch does not require moving PitchList traffic, migrating its subscribers, or using PitchList as FindPitches' rollback destination.

For a same-day launch with subscriptions, the relevant approval gates are therefore:

1. **Public FindPitches** — remove private/shadow access restrictions, attach approved FindPitches production hostname(s), expose the customer site/API and enable indexing as approved.
2. **New-customer FindPitches LIVE billing** — enable the LIVE Stripe path only for new FindPitches customers after LIVE product/price/webhook/return/Portal proof and explicit approval.
3. **Legacy PitchList subscriber migration** — a later, separate project unless an unavoidable technical coupling is demonstrated.
4. **Paid acquisition** — a later commercial/spend gate.

Passing gates 1-2 does not imply gates 3-4. V3-011 international expansion remains commercially important but is not a same-day launch blocker.

## Acceptance matrix

| Area | Current status | Evidence / assessment | Required before same-day launch approval |
| --- | --- | --- | --- |
| V3 runtime independence | GREEN | V3 customer/auth/billing runtime is native; standalone frontend checks passed; PitchList/V1 is not required for V3 runtime. | Preserve this through public release. |
| New-customer hosted billing journey | GREEN in TEST / LIVE proof pending | Genuine hosted Stripe TEST journey passed 22/22 through trial, active Pro, hosted Portal cancellation, paid-through access and ended Free/redaction. | Verify the exact LIVE product/price/mode, webhook endpoint/signing secret, Checkout and Portal return URLs, entitlement transition, duplicate-trial/charge guards and smallest approved LIVE production proof. |
| Duplicate trial / duplicate charge protection | GREEN in TEST | Association, Checkout reservation/database and returning-account protections are implemented/tested. | Re-run bounded release-candidate checks against the LIVE configuration before approval. |
| Legacy PitchList subscriber continuity | SEPARATE / NON-GATING FOR NEW-CUSTOMER LAUNCH unless coupling found | Read-only 57-row migration audit still lacks canonical LIVE coverage and has eight binding exceptions/four scheduled-cancellation cases. | Do not migrate them today. Keep PitchList unchanged. This becomes launch-blocking only if Codex shows the new FindPitches LIVE path cannot be safely isolated from legacy recognition. |
| Lifecycle / freshness integrity | AMBER, one isolated case | Fresh traces/acks are proven; two obsolete cases have append-only audited resolution. Nashville old-2026/survivor-2027 remains withheld because shared standing-market anchors do not prove edition equivalence. | Team must state whether Nashville can remain safely withheld for launch. No merge/relink merely to achieve launch. |
| Identity continuity / dedupe | AMBER, isolated Nashville review | All reviewed lifecycle identities remain withheld from private preview; no broad leakage/duplication is reported. | Confirm Nashville remains non-customer-visible and cannot create a duplicate/exposure if left unresolved. |
| Customer preview / browser behaviour | GREEN in bounded preview scope | V3-008 passed API 39/39 and browser 30/30 at the real restricted origin, covering sign-in, search, geography/facets, Pro gating, redaction, mobile, security headers/cookies/noindex and same-origin assets. | Repeat a compact smoke set on the frozen public release candidate and immediately after public routing. |
| Performance / boot latency | AMBER release concern, not current correctness blocker | Codex measured operator snapshots 3.244-4.762s, D1 execution 816-891ms, native service-binding snapshot 4.440s; repeated inventory/proof reads dominate. | Monitor at launch; safe optimisation can follow unless clean-origin testing shows systemic timeouts or unusable search. |
| Public access / shadow restrictions | AMBER / explicit change required | Current preview is private; uninvited access is restricted and checked pages are noindex. | Record exact access-control removal, hostname/Worker route, same-origin API/service binding, index/noindex change and rollback. |
| Publication/customer projection | AMBER | Preservation audits show no publication leakage; current customer inventory is private-preview eligible, not public production. | Define exactly what public exposure means. No hidden publication subsystem should be enabled unnecessarily if routing the existing customer projection is sufficient. |
| Domain / routing | AMBER | No FindPitches production custom-domain cutover has been approved. | Record exact FindPitches hostname(s), current DNS/Cloudflare state, target Worker/route, propagation expectation and exact reversal. PitchList routes remain untouched. |
| SEO / indexing | AMBER / launch choice | Current checked pages are noindex. | For a real public launch, explicitly decide which public pages lose noindex and verify robots/canonical/sitemap behaviour. This is reversible and should not be mixed with unrelated app changes. |
| Auth / sign-in | GREEN in bounded preview / public-path proof pending | Native email/sign-in is proven in restricted preview. | Verify public sign-in without invitation gating and confirm consumed-link/session/cookie behaviour on production hostname. |
| Alerts/outbound email | NON-GATING while disabled | Alert delivery remains disabled; one authorized sign-in email path is proven. | Keep alerts disabled unless separately approved. Public auth email is part of launch; campaign/alert sending is not. |
| Rollback | AMBER, corrected model | FindPitches rollback is to restore the previous private/disabled FindPitches route/deployment/access state. PitchList stays independently live throughout. | Record exact FindPitches-only reverse route/access/index/billing switches and preserve evidence. |
| Monitoring / operations | AMBER | Preservation, queue and producer evidence are strong; off-site producer backup is proven. | Freeze a launch baseline and monitor public origin, auth, billing/webhooks, entitlement/redaction, inventory, producer delivery and error/latency. |
| International expansion V3-011 | NON-GATING COMMERCIAL WORK | First Codex L1/L2 pass added no READY; AU LocalStalls is now the best conversion lever. | Continue in shadow; do not delay public release for supply growth alone. |
| Paid acquisition | HELD | Bulk/paid programme remains paused. | Keep off until V3-009 attribution/account protection, explicit budget approval and post-launch monitoring. |

## Same-day target under review

The smallest commercially meaningful launch Chris is considering is:

- public FindPitches homepage/search/browse;
- public native sign-in;
- new FindPitches customers can purchase the approved Pro subscription through LIVE Stripe;
- existing PitchList remains live and separate, with no same-day migration;
- alerts disabled;
- paid acquisition disabled;
- UKCraftFairs Option B disabled;
- V3-011 supply expansion continues independently.

A browse-only launch is not the requested target.

## Smallest safe same-day sequence — draft, review only

1. **Collect team readiness reports.** Codex and Claude each state GO / CONDITIONAL-GO / NO-GO for their owned area, including Nashville, LIVE Stripe isolation, producer health, operator requirements and rollback.
2. **Freeze the release candidate.** Record feature-branch commit, Worker versions, schemas, READY/customer counts, queue state, Pi delivery/freshness and current private access configuration. Pause nonessential release-affecting changes during the window.
3. **Separate billing scopes explicitly.** Confirm the new-customer FindPitches LIVE flow does not invoke or depend on the 57-row legacy PitchList migration path. Leave all legacy migration controls disabled.
4. **Prepare LIVE Stripe configuration without charging yet.** Verify exact LIVE product/price, mode, currency/interval/trial, webhook destination/signing secret, Checkout success/cancel URLs, Portal return URL and entitlement mapping. No LIVE customer object or charge until the explicit operator approval step.
5. **Record the exact public exposure change.** FindPitches hostname(s), Cloudflare route/Worker, private-access restriction to remove, same-origin API binding, and SEO/noindex/robots/sitemap changes. Record exact reversal for each.
6. **Run frozen preflight.** Full/focused tests; compact real-origin smoke; auth; Free redaction; Pro entitlement logic; publication/customer-projection checks; lifecycle visibility including Nashville withheld; producer age/queue; preservation audit; Stripe configuration sanity.
7. **Chris approves the exact launch plan.** Approval must separately cover (a) public FindPitches routing/access/indexing and (b) LIVE new-customer Stripe. It does not approve PitchList migration, alerts, paid acquisition or UKCF Option B.
8. **Enable public FindPitches first.** Apply only the recorded FindPitches access/domain/indexing changes, keep LIVE billing disabled for the first smoke, and immediately verify public homepage/search/sign-in/API/static assets/security headers/no leakage.
9. **Enable LIVE new-customer billing.** Apply the approved LIVE Stripe configuration and perform the smallest explicitly approved production proof. Verify Checkout -> webhook/canonical provider state -> Pro entitlement -> Portal behaviour -> safe return path. Avoid unnecessary cancellation if the chosen production proof can be completed without creating avoidable real-customer/account debris; exact proof method should come from Codex readiness review.
10. **Observe a bounded acceptance window.** Monitor public availability, auth, Stripe/webhooks, entitlement/redaction, inventory counts, identity/lifecycle exposure, producer delivery and latency/errors.
11. **Accept or reverse FindPitches only.** If a stop condition occurs, disable LIVE Checkout first if billing-related, restore the prior FindPitches private/route/index state, preserve all V3 evidence and leave PitchList untouched.

## Provisional monitoring / stop conditions

These are guardrails for the same-day review, not permanent SLOs.

- **Public origin:** sustained 5xx or inability to serve homepage/API from clean external probes over ~5 minutes is a stop condition.
- **Authentication:** systemic sign-in failure on the public hostname is a stop condition.
- **LIVE billing:** wrong price/product/mode, webhook failure preventing canonical entitlement, duplicate Checkout/subscription behaviour, incorrect trial, unexpected charge, or Portal return failure is a stop condition.
- **Entitlement/redaction:** one reproducible incorrect Pro grant, Free source-link leak, cross-market entitlement leak or paid-through error is an immediate stop condition.
- **Identity/lifecycle:** any newly exposed closed/withdrawn/held record or duplicate customer-visible identity attributable to the release is a stop condition. Nashville may remain withheld if the team confirms that is stable behaviour.
- **Inventory:** investigate unexplained >5% divergence from frozen READY/customer counts during the short release window; distinguish ordinary expiry from release-caused loss.
- **Producer:** investigate authenticated delivery age >45 minutes; only stop public service if stale producer state is causing incorrect customer output.
- **Performance:** investigate clean-origin catalogue/search p95 >2x the frozen preflight baseline for 10 minutes; roll back only if it is materially breaking use, not merely slower than ideal.
- **PitchList:** should remain unchanged. Any unexpected change to PitchList routes, billing or customer behaviour is an immediate stop condition because FindPitches launch is not supposed to touch it.

## Corrected rollback model

Rollback prefers reversing FindPitches exposure/billing changes over deleting data or touching PitchList.

1. If the issue is billing-related, disable new LIVE FindPitches Checkout/Portal entry points first while preserving Stripe/V3 audit evidence.
2. Restore the previous FindPitches access/routing configuration: private restriction/previous Worker route/custom-domain state as recorded before launch.
3. Restore the prior FindPitches SEO/indexing state if necessary while investigating.
4. Preserve receipts, facts, identities, association/billing ledgers, webhooks and failed-release telemetry. Do not delete/rebind data merely to make the rollback look clean.
5. Revoke/expire affected V3 sessions only where entitlement safety requires it.
6. Verify FindPitches is back in the known prior safe state.
7. Verify PitchList is still healthy and unchanged; it is a parallel protected service, not the rollback destination.
8. Publish the incident/checkpoint evidence after the service is safe.

## Current V3-010 position pending team reports

**Public FindPitches + new-customer subscriptions today: CONDITIONAL-GO candidate, not yet executable.** The evidence already supports taking the question seriously rather than treating it as a migration event. Remaining decision evidence is:

- Codex same-day readiness report, especially LIVE Stripe isolation/config/proof and public-runtime changes;
- Claude producer readiness report and exact Nashville custody position;
- confirmation Nashville can remain safely withheld without blocking the rest of the catalogue;
- exact production hostname/route/access/indexing change set and reversal;
- explicit Chris approval for public FindPitches and LIVE new-customer billing.

**Legacy PitchList migration: separate NO-GO / not required today.** The 57-row canonical LIVE migration gaps remain real but should not block new FindPitches customers unless Codex demonstrates hard coupling.

**Paid acquisition: NO-GO today by default.** Keep it paused until V3-009 attribution/account protection, explicit spend approval and post-launch monitoring.

**International expansion:** continue in parallel. V3-011 and later V3-012 Europe should be judged on READY gained, not raw producer volume, but neither is a prerequisite for exposing the already-working catalogue.
