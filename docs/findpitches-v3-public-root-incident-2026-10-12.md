# FindPitches public root403 incident — 12 October

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
