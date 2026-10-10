# Hosted Stripe TEST journey and subscriber acceptance

V3-005 is complete in its bounded synthetic TEST scope. One real browser journey used native V3 sign-in, Stripe-hosted card Checkout and Stripe-hosted period-end cancellation. It passed **22/22 checks**, including canonical trial → active Pro → scheduled paid-through Pro → cancelled Free/redaction. [Machine evidence](../operations/findpitches-v3/reports/hosted-customer-journey-2026-10-10.json), aggregated **17:39:14 Europe/London, 10 October 2026**. No API-created subscription stands in for hosted proof.

| Observation (London +01:00) | Canonical Stripe TEST state | V3/customer behaviour |
| --- | --- | --- |
| 17:23:49 — actual Checkout return | trialing | Trial access; GB application routes unlocked, US routes locked |
| 17:29:39 — TEST clock reaches trial end | active | Pro access; same subscription/customer |
| 17:36:36 — actual hosted portal cancellation | active, cancellation scheduled | Pro stays usable; correct paid-through date and nonrenewal notice; application links retained |
| 17:37:02 — TEST clock reaches period end | cancelled | Free access; application/source links redacted |
| Through 17:39:14 — deployed returning-account UI | cancelled | Account says plan ended; Subscribe shown with no second-trial promise; pricing agrees |

The TEST clock was attached to the existing customer **after the hosted browser created its subscription**. Stripe's canonical provider simulation performed the transitions. No customer-cache dates, source dates or webhook payloads were invented. This proves TEST temporal behaviour, not real elapsed calendar time or a live charge. The clock and ended fixture remain retained; nothing was deleted.

One new bounded fixture contains one native account, one Stripe TEST customer, one Checkout session, one subscription and one TEST clock. Browser retries reused the same Checkout; they did not create another subscription. Canonical ownership, completed native Checkout custody and exact approved TEST price were checked at every companion invocation. Public evidence contains custody hashes; raw object IDs, cookies, card inputs and hosted/one-use URLs remain outside GitHub in private files.

## Network and trust

The previous proxy CONNECT 403 blocker cleared in the running environment. Required Stripe hosted destinations became accessible under the restricted policy; saving a settings draft alone was not claimed as application. A freshly initialized isolated Chromium profile uses the **existing environment proxy CA**, constrained to the exact preview and required Stripe hostnames. Exact constraints replaced wildcard certificate-store constraints rejected by this Chromium build. The [trust tool](../operations/findpitches-v3/prepare-isolated-browser-trust.py) records the public CA digest and checks the existing Chromium certificate schema.

No certificate-error bypass, unrestricted egress, loopback substitute, system/global trust modification or production security change was used. Optional Stripe marketing/hCaptcha origins were denied; neither prevented this completed TEST flow. This is not a claim that CAPTCHA challenges can be bypassed or that every future Stripe flow needs no additional approved destination.

The [browser runner](../operations/findpitches-v3/verify-hosted-customer-journey.py) and [bounded companion](../operations/findpitches-v3/hosted-customer-fixture.mjs) retain private progress across phases. `prepare` only issues a synthetic native sign-in challenge; the browser must create/complete actual Checkout. Provider writes in the companion are restricted to this owned customer's TEST clock. Completed fixtures cannot start the journey again; `verify-ended` and `report` only inspect their ended state. A new run needs deliberate operator fixture preparation, not an acquisition/payment loop.

## Shadow fix and deployment

The journey exposed an account/pricing mismatch: returning or review-held owners could see a free-trial promise that the backend correctly refused. Additive server-derived `checkout_allowed`, `trial_eligible` and `billing_review_required` now make both screens agree with the independent backend guards. No second-trial or recognized-account Checkout guard was relaxed.

Full V3 suite **225/225** at **17:34:59**; focused customer/recognition **26/26** at **17:32:19**; standalone frontend independence check and **3/3 unit tests** at **17:34:59**. [Validation evidence](../operations/findpitches-v3/reports/customer-hosted-validation-2026-10-10.json). The prior synthetic recognition deployment's **16/16** checks remain separately timed evidence, not another real-customer migration test.

Restricted customer preview deployed **17:37:55**; active version **`774f0381-a795-4612-9a04-1e1ccb5c1715`**, 100% of that preview Worker's traffic. [Cloudflare custody](../operations/findpitches-v3/reports/customer-hosted-deployment-2026-10-10.json). Checkout/portal/temporal proof ran on the preceding `e13b345c…` version; four ended-account/pricing checks then validated the deployed additive fix. No domain routes, live billing, customer publication or production traffic changed. Native SMTP2GO credential/domain validation passed after deployment with **zero sends**; the directly installed mail binding was preserved.

## V3-004 acceptance and V3-001 support

The [subscriber acceptance package](findpitches-v3-subscriber-acceptance-2026-10-10.md) supplies exact matching rules, future read-only comparison inputs and operator review/rollback gates. The live **UK** registry contains **57** records: cached active 27, trialing 6, cancelled 22 and past due 2. 49 have exact vendor/customer/subscription profile bindings. All 57 lack retained authoritative period-end, mode, product and price coverage. This is a read-only registry measurement; no fresh canonical LIVE subscriber count is claimed, no real records imported, and no existing subscription altered.

The [late six-recheck checkpoint](../operations/findpitches-v3/reports/lifecycle-followup-2026-10-10.json) found **zero newer source checks**, six original pending tokens, no acknowledgements and 11 unresolved field conflicts at **17:24:46**. The private customer snapshot at **17:38:31** exposed **zero** of those six. Source facts and selected states were not forced to clear the requests. V3-001 remains Claude-owned/open for installed all-page full-cycle evidence and genuine fresh refetches.

## Safety and remaining gates

[Final preservation audit](../operations/findpitches-v3/reports/customer-hosted-preservation-2026-10-10.json), **17:42:31 London**, compares 15,811 retained original receipts, 108,819 source facts and 7,077 identities. It passes: zero destructive mutations, identity changes, customer projection/publication queue rows or paid queries, publication API denied, bulk off and live UK Pitchlist/V2 schedules unchanged.

No new commercial inventory total was measured. V3 stays restricted/shadow-only. Real canonical subscriber/product/price coverage, reviewed live migration, producer closure proof, alert-send acceptance and final operational/domain/publication/rollback approval remain open. ChatGPT can now review completed V3-005 plus the V3-004 acceptance package under V3-010; this work does not authorize launch or unrestricted spend.
