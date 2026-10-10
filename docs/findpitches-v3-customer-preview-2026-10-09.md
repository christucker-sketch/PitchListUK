# FindPitches V3 — commercial preview checkpoint

This is the 9 October inventory checkpoint. [The 10 October native-mail follow-up](findpitches-v3-email-setup-2026-10-10.md) records the verified native Worker credential/sender, one delivered authorised sign-in message with confirmed native sign-in, and the fresh-browser invitation checks; its counts do not replace this historical inventory snapshot.

**19:13 Europe/London, 9 October 2026 (18:13:56 UTC inventory checkpoint).** V3 now owns Claude’s full Build 4 frontend and serves real source-proved inventory through its own API, sessions and separate customer database. A restricted deployed preview and real Stripe TEST journeys pass. **Public launch, live billing/customer movement, publication, production cutover and paid acquisition remain disabled.**

## Commercial inventory

| Measure | Current count |
| --- | ---: |
| Distinct commercial entities | 7,007 |
| Verified | 1,916 |
| Source-proved READY / preview eligible | **1,910 / 1,910** |
| WATCH / quarantined / blocked | 623 / 703 / 3,771 |
| Awaiting verification / missing application proof / stale-expired | 4,468 / 4,872 / 300 |
| READY US / GB / AU / NZ / CA / IE | **1,773 / 128 / 5 / 4 / 0 / 0** |
| Public/customer-visible inventory | **0** |
| Paid queries today / added by this work | **0 / 0** |

Disposition counts are exclusive; verified/awaiting/missing/stale are overlapping flags. Origin READY counts are 1,025 platform catalogue, 414 independent structured, 344 retained V2 recovery, 123 UK official, 3 earlier source-led paid search and 1 live UK Mk1 recovery. City-search and retained legacy global paid discovery have zero current READY. These sum to 1,910.

Independent-producer membership appears in **927 READY entities**, including entities with another acquisition origin; this is not an additional 927 or an exclusive producer-origin count. UK remains concentrated: 123 of 128 READY come from Mynt Image. A new Pi cycle delivered 221 immutable receipts and 34 new producer IDs; READY increased by a net 22 since the 18:39 London checkpoint without paid queries. Proof refresh and expiry continue to change this count. The local fixture corpus is never counted.

These are distinct application-opportunity entities. Advisory exact-field grouping finds 1,223 event groups and 687 additional application entities across shared event groups; this neither proves duplicates nor authorises identity merges. The inventory should not be described as 1,910 different festivals.

## What now works

- The authoritative standalone package is physically owned by V3. **76/76 supplied checksum entries matched**; the archive’s SHA-256 is recorded in source custody. No Git commit was supplied for the archive, so none is invented. The full Finder/design/fonts/SEO are copied, with one native client.
- Same-origin native API provides proved search, real stable IDs, detail, country/region/date filters, sorting/pagination, honest empty results, saved items, alerts and organiser/inbox storage. Unsupported type/vendor suitability/fees/coordinates stay unknown; postcode/radius remains disabled.
- Native passwordless challenges, one-use redemption, hashed opaque sessions, logout revocation, CSRF and rate limits are implemented. Operator-only reserved test addresses prove the flow. Normal email requires the existing SMTP2GO key and verified sender to be accessible in this environment and copied into V3-owned bindings.
- Existing Stripe TEST price is validated: GBP £4.99 monthly, seven-day first trial. Owner/mode/price checks, trial/pro access, country scope, expiry, scheduled cancellation, duplicate Checkout protection, native portal and independent signed webhook pass. No live price/subscriber/webhook/customer setting changed.
- Clean URL routing, redirects/404, server SEO metadata, bundled fonts and native pages work. All shadow pages remain noindex; robots disallow crawling and sitemaps stay empty. Independent SEO reads run in parallel; saved-ID bootstrap no longer performs an unnecessary source snapshot fetch.
- Latest LOW-confidence/non-current/non-READY producer receipts are withheld, source-proof expiry is checked at read time, and a separate bounded native change log converges without touching source evidence. Stable producer-ID identity changes now require explicit review.

Only owned `public/` assets deploy. The provided 1,903-row dev stub is never deployed, imported or counted as commercial proof. Browser code calls only same-origin `/api/v3`; normal runtime imports have no V1/V2/old frontend dependency.

## Verification evidence and limits

| Check | Result |
| --- | --- |
| Full V3 suite, including native D1/queue and 100-row preservation control | **199/199**, zero failures/skips |
| Frontend contract tests / supplied local stub browser checks | **3/3 / 20/20** |
| Deployed UI/browser checks using real V3 inventory | **23/23** |
| Real native HTTPS/auth/Stripe TEST journey | **28 passed** |
| Native TEST portal / cancellation access / logout | Passed |
| Bundles | Eight shadow data Workers plus separate customer Worker |
| Existing immutable receipts / facts compared | **15,811 / 108,819** |
| Destructive source mutations / existing identity changes | **0 / 0** across 7,077 existing identities |
| Evidence customer/publication rows | **0 / 0** |
| Pending native webhook receipts | **0** |
| Legacy or third-party browser resource requests | **0** |
| V1 production deployment / V2 scheduler | Unchanged / empty, read-only |

Across the preserved first and corrected second TEST journey generations, six reserved-example customer accounts and four TEST subscriptions were created, with **zero live objects and zero real charges**. The first generation exposed an empty-body logout defect; the correction and second generation passed. Checkout URLs/idempotency were exercised; subscriptions were created with provider test cards. A completed hosted browser card checkout is **not** claimed.

Automatic approval review rejected adding a persistent Chromium CA trust anchor because it broadens future TLS trust. That store was left unchanged. Deployed browser checks used a loopback test relay with **verified HTTPS upstream** to the actual V3 service. This proves deployed UI/data, not direct Chromium public TLS or native browser cookie scope. Native cookie attributes/CSRF/session boundaries were verified through direct HTTPS API and unit checks. This relay is local tooling only, never customer infrastructure.

The snapshot endpoints measured about five seconds through the environment relay before client parallelisation. The repeated serial SEO reads caused a 30-second browser timeout; after the change the full deployed UI suite passed. Larger-inventory and real-user-origin latency measurements remain launch work; no unsupported performance claim is made.

## Pi, lifecycle and UK reconciliation

Pi transport is live. Earlier intervals were approximately **904 seconds**, but the latest observed interval was **1,311 seconds**; the strict 15-minute cadence flag is therefore currently false and needs host timing observation. Last authenticated contact at this checkpoint was **19:02:52 London**; latest new receipt **18:47:16**, latest source check **18:33:55**. The aggregate export freshness warning is false and reflects three-hour discovery plus one-hour export lag; individual proof expiry remains unchanged.

Structured pending rechecks: **1,389**, zero fresh-evidence acknowledgement-eligible. The immutable cloud ledger has **205** acknowledgements, latest **19:02:03 London**. Fifty arrived after the earlier checkpoint; an all-page audit safely acknowledged another 88 using fresh, accepted, linked evidence and exact work tokens. It reduced 1,409 requests to 1,321; subsequent watch ticks added new work, so 1,389 is the later checkpoint count. This proves delivery bookkeeping, not explicit host execution of every recheck or READY promotion. The supplied earlier 337-ack claim cannot be reconstructed from the newer ledger alone. Queue reconciliation had **zero due jobs** at the checkpoint; recheck work is a separate backlog, not queue failure.

The native inventory log converged manually after the new cycle: 23 inserts, 37 updates and two removals, with no pending operations in that pass. Its configured five-minute cron has not yet been independently observed executing. At the inventory checkpoint the log tracked 1,909 entities versus 1,910 currently eligible; fresh reads remain authoritative and never use the asynchronous log to grant access.

The exact supplied UK current manifest contains **218 rows**: all 218 were accepted and linked, with **2 READY, 164 WATCH, 29 quarantined and 23 blocked**. Main overlapping blockers:

| Blocker | Affected manifest records |
| --- | ---: |
| Direct source HTTP 520 | 149 |
| Single-event source proof missing | 25 |
| Application route ambiguous/missing | 13 |
| Current open vendor application not proved | 13 |
| Selected application state disagrees with proof | 13 |

This is a source-proof problem, not transport dropping 216 records. Stronger retained fetch evidence, legitimate source access and source-specific verification are the remedy. 149 inaccessible records are a maximum review population, **not** 149 promised recoverable READY opportunities. The producer’s HIGH/MEDIUM label cannot replace source proof. No weaker rule was used to promote them.

[Cloud lifecycle-feed confirmation](findpitches-v3-producer-feed-confirmation-2026-10-09.md) closes the three requested cloud semantics: retain and hide non-current states, advance an existing defensible identity additively, and accept previously unseen WATCH safely. The supplied Pi feed switch is off and its documented runner still fetches only the first 100 rechecks. Cloud-side changes do not install host code. Actual feed activation, all-page execution and a real closure/export/ack trace remain host proof requirements. The source engine and `deploy/pi` are absent from the archive, so producer source custody is still open.

## Launch priorities

| Class | Remaining item | Next action |
| --- | --- | --- |
| BLOCKER | Native email delivery not configured/verified in this running environment | The `pitchlistuk` production `SMTP2GO_API_KEY` exists but is opaque. Its sender file `/home/ct_admin/.openclaw/workspace/pitchlist-uk/.env` is on the OpenClaw machine and absent here. Securely transfer the existing raw key and sender into `/tmp/findpitches-v3-smtp2go.env` as `SMTP2GO_API_KEY` and `V3_EMAIL_FROM`; inspect verification and bind them inside V3. No duplicate account/sender |
| BLOCKER | Lifecycle feed and complete Pi recheck execution | Enable existing feed on host, follow all pages and retain real source/export/ack evidence; no stale clearing |
| BLOCKER | Producer source not owned in V3 | Supply/copy the independent discovery engine and `deploy/pi` with source custody into a separate package |
| BLOCKER before launch | Subscriber recognition and controlled mail/alerts/hosted billing proof | Prepare one-way canonical Stripe mapping, verify native journeys and explicit test recipient; no migration charges |
| BLOCKER before public operation | Production Stripe/domain/publication/cutover approval | Concrete launch/rollback review; no protected merge or production redirect now |
| BLOCKER before paid acquisition | Full external account/key/client attribution | Keep all paid work disabled; existing provider-wide lock is not claimed |
| SHOULD FIX | UKCraftFairs source access and narrow UK breadth | Work with producer retained source custody to unlock real UK proof; no Serper required |
| SHOULD FIX | Sparse source-backed facets/geocoding and latency | Add only proved categories/geography; measure real serving latency before launch |
| SHOULD FIX | Pi timing and native inventory cron observation | Investigate the latest 22-minute contact gap and retain an independently observed scheduled sync; do not weaken proof expiry |
| SHOULD FIX | Older protected-main deployment can restore paid policy | Maintain deployment freeze until approved safe promotion |

LATER: richer source-backed facets, geocoded radius, additional international breadth and reporting optimisation. None justifies invented fields or renewed paid acquisition now.

The implemented preview runtime is independent of legacy infrastructure. The unconditional whole-product “delete V1/V2 tomorrow” test is **not yet passed**, because normal email, producer source/lifecycle and existing-subscriber/domain launch gates remain open. Do not delete or switch off legacy systems to simulate it.

**Recommendation:** complete the native email/controlled sign-in gate first, then focus on retained UKCraftFairs proof and Pi lifecycle/recheck completeness. Those unlock practical subscriber value without more search spend. Keep publication, production cutover and paid acquisition disabled.

Rollback disables/revokes only owned V3 preview access/sessions and restores the previous owned Worker version while preserving customer D1, evidence and retained test records. It does not delete infrastructure, alter V1, redirect production Stripe delivery or restore paid flags.

[Architecture](findpitches-v3-customer-architecture.md) · [Machine report](../operations/findpitches-v3/reports/customer-preview-2026-10-09.json) · [Owned frontend](../web/findpitches-v3-web/README.md)
