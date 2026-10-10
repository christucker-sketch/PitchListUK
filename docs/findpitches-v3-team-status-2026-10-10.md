FindPitches V3 — team status, 10 October 2026

Inventory snapshot: **10:20:32 Europe/London**. Operational checks completed through 10:25:35. No deployments, searches, emails, subscriber changes or production changes were made for this report. The frontend follow-up created one temporary private preview grant to check protected pages and assets.

**Management assessment.** V3 now has a working private customer product: the approved Build 4 frontend, native V3 API, its own customer database, working email sign-in and Stripe TEST integration. It holds **1,849 source-proved READY application opportunities**. It remains shadow-only and has not enabled live billing or customer publication. The existing live UK Pitchlist site continues unchanged. Immediate priorities are durable freshness/lifecycle operations, broader UK supply and proving subscriber/billing/alert journeys before a launch decision. Email sign-in is now a completed gate.

**Product and service state.**

| Area | Proven current state | Remaining work |
| --- | --- | --- |
| Live Pitchlist UK / Mk1 | Existing production deployment unchanged | Keep service and paying customers protected; no V3 cutover |
| V2 | Read-only; acquisition scheduler empty; zero retained paid attempts today | Retain source evidence; no customer-field bulk copy or infrastructure deletion |
| V3 data platform | Eight owned shadow Workers, D1, queues, evidence reconciliation and source-proof gates | Sustainable proof refresh, backlog reduction and additional source adapters |
| V3 customer frontend | Standalone owned Build 4, full Finder, same-origin API, local fonts and private SEO | Broader proved facets, real-origin performance review and launch review |
| Customer storage/auth | Separate V3 database, one-use links, native sessions, CSRF and rates | Controlled recognition of existing paying subscribers |
| SMTP2GO | Existing account/sender reused; deployed credential verified; one email arrived and native sign-in confirmed | Alert delivery is still disabled |
| Stripe | TEST Checkout, entitlement, portal and signed webhook implemented; zero pending webhook receipts | Hosted checkout completion, controlled subscriber recognition and approved live configuration |
| Paid acquisition | Bulk off; commercial programme manually paused; audited legacy controller flags all false | Account/client attribution and explicit later approval before further paid work |
| Public launch | Publication, cutover and live billing disabled | Concrete launch/rollback review and explicit approval |

Search is free under the approved policy; application/source links and alerts are Pro features. The approved TEST plan is GBP £4.99/month with a seven-day first trial. Existing live customers have not been migrated or automatically recognised in V3. Sign-in success does not prove Pro entitlement. Public/customer-published V3 inventory is zero; authenticated private preview access is intentional.

**Frontend deployment — verified 10:35 London, 10 October.**

The approved standalone Claude Build 4 frontend is **deployed and running**, bundled with the owned `findpitches-v3-customer-preview` Cloudflare Worker. Preview URL: https://findpitches-v3-customer-preview.ctucker.workers.dev . It is physically owned in `web/findpitches-v3-web/public`; no legacy frontend or local fixture server is required at runtime.

The active Cloudflare version is `b218bfcf-1f5f-4395-893e-be9ce4d81d8d`, created/deployed at **10:06 London** today, serving 100% of this preview Worker's traffic. The owned code/assets deployment record is 09:55; the later active dashboard version reflects the mail configuration update. This is preview traffic, not a production cutover. The repository checkpoint remains `00c752e2104d4006600d12b9188aa91ba2199c6b`; a Cloudflare version ID is not a Git commit.

Live protected HTTP smoke checks returned **200 for all seven pages**: homepage, full Finder, account, pricing, saved items, alerts and organisers. Sampled CSS, V3 API client JavaScript and a bundled font also returned 200. All checked pages return noindex metadata and headers. This adds a current HTTP/asset check to the previously retained 23/23 deployed UI browser checks; it is not a new full browser suite.

The frontend reads the **real V3 API via a private service binding**, with **1,849 currently eligible records**. Native email sign-in works. Billing remains TEST; alert storage is present but email delivery is disabled. Unknown vendor facets/fees/geocoordinates are not invented; radius search remains unavailable.

**Access is restricted.** A direct uninvited homepage request returns 401. Your browser with the successful sign-in should have preview access; other team members need authorised preview access. The URL alone does not grant access, and the consumed sign-in link cannot be forwarded as an invitation. One temporary private operator preview grant was created for this smoke check; no email or new customer account was created.

Cloudflare reports **no custom domains** for this Worker. Independent zone-route reads show **no routes to it on findpitches.com or pitchlist.uk**. The live Pitchlist production deployment remains unchanged. Public SEO publication, production domain routing, live billing and cutover remain disabled. Remaining frontend launch work includes real-origin performance/security review, completed hosted TEST payment and subscriber journeys, supported source-backed facets, and explicit launch approval.

**Authoritative commercial inventory.**

| Exclusive acquisition origin | Distinct entities | Verified | READY | WATCH | Quarantined | Blocked |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Claude / Pi structured producer | 1,158 | 405 | 401 | 279 | 269 | 209 |
| V2 recovered evidence | 4,555 | 335 | 332 | 248 | 401 | 3,574 |
| Original city search | 20 | 0 | 0 | 0 | 10 | 10 |
| Bounded source-led paid pilot | 7 | 3 | 3 | 3 | 1 | 0 |
| Free platform catalogue | 1,172 | 989 | 989 | 64 | 116 | 3 |
| UK official organiser programme | 123 | 123 | 123 | 0 | 0 | 0 |
| Salvaged legacy paid UK discovery | 7 | 0 | 0 | 0 | 0 | 7 |
| Live Pitchlist UK recovery | 2 | 1 | 1 | 1 | 0 | 0 |
| **Total** | **7,044** | **1,856** | **1,849** | **595** | **797** | **3,803** |

Origin is the earliest accepted commercial receipt and sums without double counting. The structured producer also contributes evidence to **898 READY entities**, including entities originating elsewhere; that is overlapping membership, not an additional 898. Tests/controls exclude **108 entities**. READY/WATCH/quarantined/blocked are exclusive dispositions. Verified and the following proof flags overlap and must not be summed.

| Origin | Awaiting verification | Missing application proof | Stale/expired |
| --- | ---: | ---: | ---: |
| Claude / Pi structured producer | 452 | 638 | 105 |
| V2 recovered evidence | 4,103 | 4,198 | 271 |
| Original city search | 11 | 20 | 0 |
| Bounded source-led paid pilot | 0 | 3 | 0 |
| Free platform catalogue | 124 | 158 | 127 |
| UK official organiser programme | 0 | 0 | 0 |
| Salvaged legacy paid UK discovery | 7 | 7 | 0 |
| Live Pitchlist UK recovery | 1 | 1 | 0 |
| **Total** | **4,698** | **5,025** | **503** |

**READY by country and source.**

| Country | READY |
| --- | ---: |
| GB | 128 |
| US | 1,713 |
| AU | 4 |
| NZ | 4 |
| CA | 0 |
| IE | 0 |

| Source domain | READY |
| --- | ---: |
| eventeny.com | 1,715 |
| myntimage.co.uk | 123 |
| localstalls.com | 10 |
| northamptontowncouncil.gov.uk | 1 |

All current READY states are source-proved OPEN_NOW. READY inventory is **92.65% US** and **92.75% Eventeny**. UK has 128 applications across 127 advisory exact event groups and five organisers; **123/128 (96.09%)** are Mynt Image. This is a narrow UK launch offering despite the international headline count. AU/NZ remain sparse and CA has no READY supply.

Globally, 1,849 application entities form **1,187 advisory exact event groups**; 662 are additional applications sharing exact event fields. This is not 1,849 distinct festivals, and the grouping neither proves semantic duplicates nor changes identity.

The last evening checkpoint was 1,910 READY: the current net change is **−61 (−3.19%)**, comprising US −60, AU −1, GB/NZ unchanged. No per-record attribution of that entire decrease was run for this status report. Current telemetry separately records 168 previously confirmed READY entities withheld because proof/data is stale or expired. Retained evidence is preserved. New first-time READY today is zero; renewals do not count as new growth.

**Commercial quality and KPIs.**

- Current READY has application URL, location and organiser proof in **100%** of records; **93.56%** have a future event start date. Ongoing events can have a past start; no dates are invented.
- **3,303** commercial entities have undergone verification; **55.98%** are currently READY. This is current inventory against ever-checked entities, not a paid acquisition conversion claim.
- Unsupported categories, vendor suitability, fees and coordinates remain unknown. Postcode/radius search is unavailable until defensible geography support exists.
- Lifetime V3 paid query attempts are **25**. Four paid-origin entities reached confirmed READY historically; three remain READY now. Historical yield is **16 first-confirmed READY per 100 queries**, or **6.25 queries per historical READY**. These figures exclude free producer/catalogue output.
- The source-led trial specifically used 12 queries, currently retains three READY, and remains paused after a restricted-audience false-promotion stop. Current candidate duplicate rate is 21.43%; WATCH/quarantine candidate rate is 64.29%. The audience rules were tightened; neither candidate volume nor an old READY label overrides current proof.
- Monetary cost/READY remains unavailable because no account-specific unit credit price is configured. V3 ledger has 24 observed credits and one older query with unobserved billing; do not invent a monetary amount.

**Producer and operational health.**

Pi delivery is active: latest authenticated poll **10:09:03 London**, latest new receipt **09:53:33**, latest source check **09:38:07**. The current aggregate freshness warning is false. Cloud expects 15-minute transport; the three latest intervals are approximately 21.0, 15.1 and 15.1 minutes, so strict cadence verification is false. Discovery every three hours plus up to one hour export lag is separate from delivery and never extends individual proof expiry.

The structured lane retains **3,600 immutable receipts** for **2,046 producer IDs**. Unchanged replay/changed and new delivery controls pass; stale exports cannot clear rechecks. The immutable acknowledgement ledger reports **544 acknowledgements in the last 24 hours**, with the latest at 09:54:03. There are **1,384 pending entity rechecks**, including 153 GB and 1,023 US; only four currently have fresh acknowledgement-eligible evidence. An acknowledgement proves accepted linked evidence, not READY or explicit execution of every host request.

The supplied host package still needs confirmed lifecycle-feed activation, complete all-page recheck execution and a real current→closed/held/retired→export→ack trace. These remain open until independently evidenced. The cloud implements the semantics; host installation cannot be inferred from transport. The independent discovery engine and deploy/pi source were absent from the handover ZIP, so V3-owned producer source custody is also open.

At **10:22:13**, there were **zero due, leased or dead jobs**. The earlier status had 9,170 watch jobs ready; the later due-job check was clear. Scheduled watch work and 1,384 producer rechecks are different backlogs. There are 249 unresolved evidence/identity conflicts, which stay held. Native inventory tracking matches 1,849 eligible entities; its five-minute cron is configured, but an independent scheduler trace was not captured in this check. Pending billing webhook receipts are zero.

**Spend and safety.**

- Today: **zero V2 paid attempts, zero V3 paid attempts and zero paid queries used for this report**.
- Serper balance at 10:22:15: **43,474**, unchanged from the recorded post-pause balance.
- Global V3 safeguards remain **4/run, 100/hour and 1,000/day**. The commercial programme has a lower **25/day** cap and manual pause; no paid scheduler is active. The generic Serper pause flag is false, but bulk is off and commercial admission is paused. Remaining budget is not permission to spend.
- All four audited legacy execution/controller flags, including UK, US/global and CA, are false. A complete read-only history inspection found **zero active workflows across 1,788 retained instances**. V2's scheduler is empty.
- These controls do not lock every external/Pi client holding a Serper key. That attribution remains open even though the observed balance is stable. Old protected-main deployment configurations must not restore enabled paid flags.
- A fresh full preservation audit compared **15,811 original receipts, 108,819 source facts and 7,077 identities**: zero destructive source mutations, zero identity changes, zero customer projection/publication queue rows, and denied public API access. Live Pitchlist deployment and V2 scheduling remain unchanged.

The wider retained evidence store currently contains 16,494 receipts, 116,943 source facts and 17,115 source documents. These are evidence/version counts, not opportunities or customers.

**Legacy content and unresolved proof.**

V2 evidence remains retained and reconciled; **332 origin-attributed entities are READY now**, with other V2-backed entities originating through additional lanes. This does not imply the recovered corpus is lost. Historical recovery labels are not current customer readiness.

The complete UK-only live Pitchlist catalogue audit inspected **290 records, 436 source/application URLs and 20 PDFs**. It found one clearly usable, two usable with minor gaps, 217 unresolved, 53 reference-only, eight explicitly stale/closed and nine wrong/unsafe for that recovery. Unresolved does not mean junk. Three recoveries entered shadow through normal identity decisions: one READY and two WATCH, one of which matched an existing entity. Useful licensing/reference material is kept distinct from offered opportunities.

The largest current GB access blocker is **154 ukcraftfairs.com entities with source HTTP 520**. Other overlapping GB holds include 37 missing single-event proofs, 19 unproved open vendor applications, 17 ambiguous/missing application routes, 17 state contradictions and 12 start-date contradictions. These populations are not guaranteed READY upside. Any repair must add stronger source evidence, preserve originals and retain exact identity.

**Recommended delivery sequence for the team.**

| Priority | Suggested responsibility | Concrete completion evidence |
| --- | --- | --- |
| 1. Freshness and lifecycle | Producer/OpenClaw plus V3 backend | All-page exact-ID rechecks executed; backlog trend improves; a real closure trace reaches unavailable preview; no stale acknowledgements |
| 2. UK inventory breadth | Producer evidence custody plus source verification | Unlock retained UKCraftFairs source evidence; add source-specific proof; grow measured READY across more organisers and regions. 154 blocked pages are a review ceiling, not a promise |
| 3. Independent producer custody | Producer owner plus V3 repository | Copy the discovery engine and host deployment source into an owned separate package with checksums, runtime instructions and tests |
| 4. Subscriber and commercial journeys | V3 customer/billing | Controlled existing-customer recognition; hosted TEST checkout/cancellation journey; approved test alert delivery; no duplicate charges |
| 5. Launch review | Product/operator plus engineering | UK supply/quality acceptance, proved facets and performance/security checks, precise domain/publication/billing plan and rollback; explicit approval before live changes |

Next UK source expansion after access recovery should prioritise official multi-event operators, such as the retained Folk & Bespoke application routes and regional/nation-specific councils, rather than broad city search. Reaching thousands requires recurring proved source programmes and freshness operations, not counting weak discoveries or relaxed proof.

**Release evidence.** The latest full V3 suite is **210/210 passing**, focused mail/auth **21/21**, with prior deployed browser **23/23** and native HTTPS/Stripe TEST journey checks retained separately. No full suite was rerun for this read-only status. Hosted browser card-payment completion and unconditional whole-product independence are not yet claimed. The runtime code checkpoint is **00c752e2104d4006600d12b9188aa91ba2199c6b** on findpitches-v3/greenfield. This report is a documentation-only addition; no runtime deployment was made.
