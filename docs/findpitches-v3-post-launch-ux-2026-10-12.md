# FindPitches V3 post-launch UX checkpoint — 12 October

Codex status **2026-10-12T12:00:00+01:00**. [Machine evidence](../operations/findpitches-v3/reports/post-launch-ux-2026-10-12.json). Source code `b72a4828`, branch `findpitches-v3/greenfield`.

**Safari homepage recovery is confirmed by Chris. Public browsing and LIVE Checkout are open.** The focused UX increment is deployed and verified; genuine owned Checkout → global Pro → Billing Portal/cancellation acceptance remains pending. Paid acquisition remains paused.

The homepage selected countries using `draft_has_data`, a field V3 never returns. Its upcoming API already had 30 GB records, but the page selected no countries. It now uses real counts and one fresh, redacted homepage response, renders 11 future-event rows per selected country, and gives a deliberate empty state where dates are unavailable. Row identity and application/source redaction are unchanged.

The region mapper ignored explicit proved “South East” and “South West” names. It now recognises exact registry names, keeps contradictory/unmapped geography unknown and uses no town/postcode guesses. The homepage displays three real UK area links. The specific reported East Anglia card was not present in the current Build 4 homepage; the actual API defect and absent area links were reproduced and repaired.

Brand/Finder shells no longer read an entire catalogue before serving their fact-free HTML. Finder boot reads static country/region taxonomy with counts marked unknown, then gets results/counts/facets from one fresh source-proof request. Optional price loading no longer blocks rendering. Source-backed detail/SEO, proof expiry/revision/producer holds and server-side global Pro checks remain fail-closed; no shared stale proof cache was added.

| Browser viewport | Homepage document | Homepage data | Finder results |
| --- | --- | --- | --- |
| desktop | 4.11s → 0.77s | 10.58s → 3.69s | 10.40s → 3.66s |
| mobile | 3.71s → 0.47s | 12.10s → 3.32s | 11.38s → 3.10s |

These are two bounded Chromium observations through the Codex proxy, before and after, with the final observations taken without parallel validation. They are not real Safari or load-test guarantees. Under parallel audit/browser checks, a homepage-data sample still took 9.01s. The remaining latency is in fresh catalogue work; further compact/batched source reads are a follow-up, not claimed solved.

**Map limitation:** GB/US have no retained proved venue coordinates in the current path, so UK pins remain 0. The map now explains that all 127 UK listings remain in the list. Backend finite venue-point/filter checks and 16 local desktop/mobile controls pass, including one clearly synthetic renderer point and its removal after filtering. No production point, source fact, identity or customer record was fabricated. The next map task is source-specific coordinate extraction, exact venue/address verification and additive provenance through to the customer API. No Serper spend is needed to start; town/postcode centres must not masquerade as venues.

Full V3 **268/268**, failures/skips 0; frontend **3/3**, independence, boundaries and native build pass. Actual public API/security/SEO **29/29**, browser **25/25** in each Checkout state, desktop/mobile UX pass; TLS/CSP remain enabled. Final code release `d05030c4-f8df-4c13-a9de-927a55484ec5` at 2026-10-12T10:34:27.930Z; Checkout restored at 2026-10-12T10:46:41.173Z, current version **`e351d86b-eb77-4b59-badd-4d4eeb682684`**, deployment `8ebbb509-9704-416e-9dcf-cba3974807b8`. Native bindings/secrets, current route IDs, DNS, schedule and protected PitchList are preserved; migrations 0/source-identity writes 0/provider provisioning 0/messages 0.

Native **2026-10-12T10:53:45.860Z**: **1,782 customer-eligible READY — GB 127 /US 1649 /AU 2 /NZ 4**; Nashville 0. Customers/subscriptions/Checkout attempts 0, pending webhooks 0; two processed unowned receipts do not prove owned acceptance. Source at 2026-10-12T10:53:42.830Z: due 5, leased 1, dead 0; these are bounded scheduled verification jobs, not paid acquisition. Pi contact/cadence/source freshness healthy; pending producer rechecks 259 are separate from verification jobs. READY is a timestamped snapshot, not a fixed claim; no item-level attribution for the latest 2-US fluctuation is asserted here.

Preservation **2026-10-12T10:39:36.198Z** compares 15,811 original receipts, 108,819 facts and 7,077 identities: destructive mutations 0/identity changes 0. Source publication/customer projection/publication queue remain 0/off, protected PitchList/V2 schedules unchanged. Controlled FindPitches public reads are separately authorised by D-014/D-016. V3 paid queries 0/bulk off/commercialmanually paused.

Chris's own genuine hosted LIVE Checkout/global UK+US Pro/Portal result is the remaining launch acceptance dependency. If only testing, cancel before the seven-day trial ends; Codex then verifies owned canonical receipts and paid-through access privately. ChatGPT retains overall coordination; no peer acknowledgement or overall DONE is implied. Paid acquisition, alerts, migration, UKCF OptionB, destructive actions and protected merges remain closed.
