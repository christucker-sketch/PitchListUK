# Private preview operational checkpoint

V3-008 is complete for bounded real-origin measurement and verified repairs. [Combined sanitized report](../operations/findpitches-v3/reports/native-operational-checkpoint-2026-10-10.json). This is restricted shadow acceptance evidence, not launch authorization or a production load/security audit.

The deployed origin is <https://findpitches-v3-customer-preview.ctucker.workers.dev>. Customer Worker version **`9ba2ac7a-7cdf-4cc0-b0f4-b11477c52169`** was deployed at **19:14:49 London** on 10 October, serving 100% of private preview traffic. There are no production-domain route changes. Existing native mail configuration was preserved and independently validated; zero messages were sent.

## Measured acceptance

- **39/39 API checks**, completed **19:17:48 London**, with 29 bounded GET probes and temporary reserved TEST authentication setup. Uninvited HTML/API denied; private responses no-store/noindex; source/application links redacted for Free in GB/US/CA/AU/NZ. A retained TEST subscriber passed a fresh canonical GB Pro check and could not unlock US links. No new provider subscription, charge or fixture-date edit.
- **30/30 browser checks**, completed **19:24:29 London**, with 237 requests below the 250-request cap. Native consumed sign-in, Secure/HttpOnly host cookies, homepage, full GB/US Finder, real detail, SEO hub, pricing/account/saved/alerts pages, mobile layout, local fonts and zero foreign website requests passed. Previous TEST tabs were closed before observing this website. TLS remained validated using the existing exact-host CA in the isolated profile; no bypass or global trust change.
- Full V3 **225/225** passed after the backend fix. Focused customer/recognition **26/26** and frontend independence plus **3/3** passed after the final CTA changes. Each test artifact's completion time and scope is recorded separately in the report. Existing V3-004/005 remain DONE; no hosted checkout was repeated.

## Repairs verified at the deployed origin

1. **Honest type totals.** Previously All types showed zero despite real results because all current preview types lack source proof. The API now reports `unclassified_types`; the total includes them while their individual type remains null. No category was invented to make a filter work.
2. **Honest geography.** Non-region place searches are literal matches against retained location. Their heading/hint now names that place rather than claiming all-country results or postcode distance. Postcode/distance promises are removed where geocoding is unavailable. Unsupported radius and `sort=nearest` return `400 radius_unavailable`; old nearest bookmarks normalize to supported sorting in the Finder.
3. **Honest trial offers.** Finder, application unlock and alerts upgrade controls now follow canonical trial/Checkout eligibility, like account/pricing already did. Ended accounts see Subscribe to Pro; review-held accounts see Review billing. Backend duplicate-charge/second-trial guards remain independent and unchanged.

## Commercial and performance observations

At **19:17:48 London**, the sampled private preview search totals were **1,841 eligible application listings**: GB **128**, US **1,705**, AU **4**, NZ **4**, CA **0**. This is current preview availability, not a refreshed full commercial-origin breakdown. The earlier 10:20 commercial inventory report retains its original timestamp. All 1,841 preview types remain unclassified; useful category filtering needs additive source-backed classification.

Across 15 successful catalogue API reads, median latency was **4.100s**, sampled p95/max **5.055s**. Browser route readiness ranged **4.176–20.161s**. These include the environment proxy and browser interception, which disables HTTP caching; they are neither global user latency nor a load-test percentile. Nevertheless, they warrant profiling repeated proof-snapshot reads and frontend boot dependencies before release. Any optimization must retain expiry, lifecycle holds, exact identity and per-request entitlement/redaction; a stale cache is not an acceptable shortcut.

At **19:20:44**, there were **zero due, leased or dead pipeline jobs** and **zero pending customer webhooks**. The 9,280 remaining ready watch jobs are scheduled in the future, not reconciliation backlog.

[Preservation at 19:21:21](../operations/findpitches-v3/reports/native-operational-preservation-2026-10-10.json) compared 15,811 retained receipts, 108,819 facts and 7,077 identities: **zero destructive source mutations, zero identity changes, zero customer-projection/publication rows**. Publication API remains denied, bulk paid acquisition off and V3 paid queries today zero. Protected live UK Pitchlist deployment and V2 schedules were unchanged. Temporary synthetic auth/session and normal derived-cache activity are distinct from real customer/source changes; no real import, provider write, email, cutover or protected merge occurred.

## Remaining launch work

The [six-item lifecycle checkpoint](findpitches-v3-lifecycle-final-cloud-2026-10-10.md) now proves three exact original-token acknowledgements and a complete lifecycle trace. It still holds three specific obsolete/replacement/cross-edition resolutions; V3-001 is not supported for closure yet. The [LIVE migration gate](findpitches-v3-live-migration-gate-2026-10-10.md) requires fresh canonical evidence for 57 registry rows, eight vendor exceptions, an actual price policy and reviewed cohort/rollback approval.

ChatGPT can fold this report into V3-010, with preview latency as an explicit release concern. Highest-value engineering follow-up: profile and reduce catalogue/boot latency while preserving live proof checks. Controlled launch/domain/publication, real migration/live billing and paid acquisition remain separate closed approval gates.
