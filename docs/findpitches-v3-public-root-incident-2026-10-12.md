# FindPitches public root403 incident — 12 October

**Latest runtime — 2026-10-12T12:00:00+01:00:** [Deployed post-launch UX and restored Checkout](findpitches-v3-post-launch-ux-2026-10-12.md); Safari recovery accepted, public/Checkout LIVE, genuine owned billing/Portal acceptance pending. Older entries below retain their original timestamps.

**Current status — 2026-10-12T10:48:10+01:00:** The Safari public-navigation incident is resolved on Chris confirmation (“Homepage opens normally”). Guarded new-customer LIVE Checkout is reopened and actual enabled-browser checks pass. Genuine owned LIVE Checkout/global Pro/Portal acceptance remains pending. Earlier dated checkpoints below are history.

Codex checkpoint **2026-10-12T09:19:21+01:00**. Source report: [real Safari incident](../team/PRODUCTION_INCIDENT.md).

**New Checkout is paused. Scoped HTTP public-navigation fix is tested and ready for a customer-safe release; real-device acceptance remains pending.** Public HTTPS, account recovery, signed webhook, Portal and LIVE storage are preserved. No PitchList/shared Pages or source/identity change.

Chris confirms he typed the bare domain. Actual HTTPS root/index/pricing/Finder requests with Mobile Safari navigation headers return HTML200. Cloudflare Always Use HTTPS is off. The old production Worker rejects an HTTP document request with JSON403 before rendering; a new regression reproduced403 where301 was required. This identifies a concrete missing redirect consistent with the report. External HTTP cannot be measured from this runner (proxy/direct port80 unavailable); do not claim an observed Safari/edge HTTP trace.

The repair redirects **GET/HEAD document and asset navigation on exactly the owned HTTP apex/www** to canonical HTTPS apex, preserving path/query. It neither skips production/schema checks nor redirects/exposes protected API, operator, preview, webhook or mutation surfaces. HTTPS behaviour and source/entitlement rules remain unchanged.

Validation before release: full **264/264**, zero failures/skips; production/redirect/release/pause focused **21/21**; frontend **3/3** and independence; V3 boundaries; native build pass. The HTTP regression failed against old code (actual403/expected301) and passes with the fix. Foreign hosts/ports, protected GETs, unsafe methods, unsigned webhook and preview provisioning stay denied.

Full preservation at **2026-10-12T08:12:40.270Z** compares15,811 receipts/108,819 original facts/7,077 identities: mutations0/identitychanges0; PitchList Pages/V2 schedules unchanged; paid0/bulkoff/source publicationoff.

The new release helper requires the exact owned LIVE Worker/D1, new Checkout closed, account recovery enabled, native existing secrets, exact two owned routes and unchanged customer schedule. It constructs configuration from actual native bindings, not stale local launch flags; retains variables/secrets; runs no migration; verifies bindings/settings, DNS/routes/schedule and protected PitchList after release. Any failed release verification triggers customer-safe pause. It cannot reopen Checkout or expand publication/acquisition scope.

Next: deploy that guarded release, rerun actual-host anonymous browser/API/security/SEO with Checkout closed, inspect native provider/producer/source controls, then request a fresh Safari bare-domain check. Reopen Checkout only once public acceptance is restored; real owned Checkout/global Pro/Portal proof remains separate.

## Release safeguard correction — 2026-10-12T09:32:06+01:00

The first code release used Wrangler `deploy`; it recreated the two owned FindPitches route IDs, retaining the exact patterns/script and fail-openfalse. Strict route-ID preservation caught this and automatically paused public browsing with account recovery/webhook/Portal/storage retained. All native bindings/settings had already passed preservation; no DNS, Pages, PitchList, source, identity or paid change occurred. This was an avoidable release-tool choice; the unintended own-route replacement is recorded rather than described as unchanged.

The release helper now uses **versions upload → verify uploaded native bindings → deploy that exact version at100%**, which does not apply routes or schedules. Route declarations are omitted from the uploader configuration. It still compares exact current route IDs/content after activation. Full264/264 and focused21/21 rerun pass. Current routing custody is the new owned IDs; no further route recreation is allowed. After the guarded release, browsing will be restored with new Checkout closed for root/browser and real Safari re-proof.

## Deployed recovery checkpoint — 2026-10-12T09:53:00+01:00

[Machine evidence](../operations/findpitches-v3/reports/public-root-incident-2026-10-12.json). **Public browsing restored; new Checkout remains closed pending the fresh bare-domain Safari recheck.** Actual root/index HTML, Free gating, assets/navigation, UK/US Finder, global pricing, disabled alerts, SEO and protected surfaces pass: native public **29/29**, anonymous browser **25/25**. TLS/CSP were not bypassed. Full264/focused21/frontend3/independence/boundaries/build pass.

Code release at2026-10-12T08:33:17.014Z, version `7676cb7d-6535-4a95-ac02-8389e57c2ebc`, exact version-upload/deploy method, native bindings/settings/current routes/DNS/PitchList preserved. Browsing-restoration flag version **`fb9601db-13f1-4bd2-b209-e7eff37baa74`**, deployment `0790d24d-23e4-42ac-9b42-c6841e3565c2`, at2026-10-12T08:35:22.593Z. It retains the repaired code; Checkoutdisabled/accountrecoverytrue. No schema migration, secret replacement, provider/customer provisioning, source/identity change, paid query or email.

Native at2026-10-12T08:38:46.028Z: **1,778 READY (GB127 / US1645 / AU2 / NZ4)**, Nashville0; live billing/mail probes200, customers/subscriptions/Checkout attempts0, pendingwebhooks0. Processed unowned receipts are not owned customer acceptance. Queue due0/leased0/dead0; paid0/bulkoff/manualpaused. Pi cadence/source healthy, pendingrechecks198. Final preservation **2026-10-12T08:43:24.394Z**: 15,811 receipts /108,819 facts /7,077 identities, zero destructive mutations/identity changes; protected PitchList/V2 schedules unchanged.

Chris: retry typing `findpitches.com` in a fresh Safari Private tab. A 200 HTTPS smoke does not itself prove the previously failing real-device navigation, and this runner cannot send external HTTP. On confirmed recovery, the existing D-014 authority allows guarded Checkout reopening; genuine hosted Checkout → global Pro → Portal remains a separate operator proof. ChatGPT retains acceptance coordination.

## Real-device acceptance and Checkout reopening — 2026-10-12T10:48:10+01:00

Chris completed the requested fresh Private Safari bare-domain check and replied “Homepage opens normally”; receipt recorded at 10:42 London. No external HTTP trace is claimed. D-014/D-016 already authorize the guarded reopening, so no duplicate approval or credential transfer was needed.

Checkout flag changed to LIVE at **2026-10-12T09:44:18.498Z**, version **`63fb3d42-f71b-493c-9b27-3ad8c32c89f0`**, deployment `bd5cfc12-67aa-4e30-ae0d-01a2dd712d5c`. Public browsing/account recovery remain enabled. Exact current route IDs and every unrelated native binding are preserved; no DNS/Pages/provider/customer/source/identity write. PitchList remains healthy with the original deployment.

Fresh public API/security/SEO **29/29**, browser with Checkout closed **25/25**, enabled **25/25**, native Stripe/SMTP200, full source preservation at **2026-10-12T09:43:21.232Z**: **15,811 receipts /108,819 facts /7,077 identities**, zero destructive mutations/identity changes; V2 schedules/PitchList unchanged. Successful earlier 12October full264/focused21/frontend3/independence/boundaries/build results were retained, not re-dated or rerun for a flag-only change. TLS/CSP remained enabled.

Native **2026-10-12T09:45:44.840Z**: **1,785 customer-eligible READY (GB127 /US1652 /AU2 /NZ4)**; Nashville0. Customers/subscriptions/Checkout attempts0; two processed unowned receipts, pending0. Source **2026-10-12T09:45:41.566Z**: paid0/bulkoff/manualpaused, due0/leased0/dead0; five scheduled jobs briefly became due at09:44:40Z and cleared by the next observed cycle. Pi contact/source healthy, pendingrechecks61. Recheck acknowledgements do not establish customer readiness.

**Remaining acceptance:** a genuine own-account hosted LIVE Checkout → signed owned canonical subscription → global UK/US Pro application access → Billing Portal/cancellation journey. Requested from Chris in this session; no synthetic LIVE objects or TEST substitute. ChatGPT retains overall coordination; V3-010 is not DONE. Paid acquisition, alerts, legacy migration, UKCF Option B, destructive changes and protected/live merges remain closed.
