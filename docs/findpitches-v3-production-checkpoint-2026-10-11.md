# FindPitches V3 production implementation checkpoint

**Later update:** the Stripe attachment has now been received, exact LIVE objects verified and native keys/webhook bound. See the [LIVE provider preflight](findpitches-v3-live-provider-preflight-2026-10-11.md). Production mail binding remains pending; the observations below retain their earlier timestamps.

Codex, 11 October 2026. Measurements below are individually timestamped in UTC and London time. Authority: D-014/D-016 and the [current launch orders](../team/ORDERS.md). [Machine checkpoint](../operations/findpitches-v3/reports/customer-production-checkpoint-2026-10-11.json).

## Release position

**Production implementation deployed safely gated; public launch remains blocked on secure credential transfer into this Codex environment.** No additional launch approval is requested. Chris already authorized the controlled launch. The original shadow evidence service, restricted TEST preview and protected live PitchList remain separate.

The pricing policy is resolved: one global Pro entitlement, GBP £4.99 / USD $6.99 / EUR €5.99 per month, seven-day first trial. Currency changes billing presentation, never which countries a subscriber can access. The customer selects among the three currencies. The displayed choice is captured for Checkout, and an older asynchronous price response cannot overwrite the newer selection. An unfinished Checkout reserves the chosen currency until its session expires; a concurrent different-currency request is explicitly refused rather than creating another subscription.

## Implemented and deployed

- New isolated Worker and D1: `findpitches-v3-customer-production`. Explicit `production_public` mode, immutable database mode marker, LIVE-only constraints, native customer ownership and durable webhook receipts. No conversion or migration of the preview database.
- Independent LIVE billing module: canonical V3 customer/product/price/subscription ownership; all three approved prices grant global access. Wrong-mode, wrong-product/price/owner and duplicate active subscriptions fail closed. First-trial history survives cancellation; concurrent Checkout calls share one reservation/provider idempotency key.
- Public browsing/sign-in implementation, secure native sessions, CSRF and bounded public/auth/Checkout requests. Synthetic `/preview/*` routes are unavailable in production. Origin is restricted to FindPitches; `www` redirects to the apex.
- Account/Portal recovery can remain available while catalogue access and new Checkout are disabled. Its HTML, market registry and billing/session APIs do not require the source-proof backend. LIVE Portal ownership is checked separately from subscription reconciliation, so a source/backend fault cannot suppress cancellation access.
- Every catalogue read still uses the private evidence service and original proof/held/expiry filters. Duplicate IDs in a source-proof snapshot fail closed. Original source fields/identity are unchanged.
- Public SEO implementation indexes eligible clean pages and proved opportunity routes; account/API/private/empty pages remain noindex. Private preview remains noindex. Truthful alert copy and an explicit unavailable capability replace launch promises of delivered alerts.
- Gated deployment, secure existing-sender configuration, independent verification/adoption of Hal's existing LIVE objects, and exact read-only FindPitches routing/rollback plan are supplied under `operations/findpitches-v3/`.

Final gated deployment at **16:37:24 London / 15:37:24 UTC**: version `2b73d94f-cf96-43b5-92a9-ead5a1d0d6a8`, deployment `21d559e0-83a7-4f72-b55c-30eabd839405`. Native URL: `https://findpitches-v3-customer-production.ctucker.workers.dev`. Health is reachable; browser/customer access and Checkout are disabled. This is not a public site launch. No custom route or DNS change was applied.

## Verification and inventory

Full V3 suite **253/253**, focused customer **50/50**, frontend independence and **3/3**, boundary check and native bundle passed. Coverage includes TEST/LIVE database separation, all three global entitlements, wrong mode/owner/product/price, concurrent Checkout/currency collisions/repeat-trial refusal, webhook replay/out-of-order canonical reads/signature/failure retry, paid-through/expiry/redaction, gated public/SEO/provisioning controls, billing recovery without the evidence backend, and provider setup/adoption that never modifies legacy objects.

These are local fixtures plus real gated Cloudflare deployment/proof checks. The genuine hosted TEST journey remains dated 10 October. No genuine LIVE Checkout/card, production subscription, public-origin browser flow, load/penetration proof or new sign-in email is claimed here. Those follow the real credential/provider/routing steps.

At **16:43:00 London / 15:43:00 UTC**, native authenticated preflight reads **1,811 eligible**: GB127 / US1,678 / AU2 / NZ4 / CA0 / IE0. Production customers0, pending customer webhooks0, Nashville eligible0. Public-visible inventory is still0 because the public access/route gate is closed.

Queue due0 / leased0 / dead0 / future9,278. Paid queries today0; bulkoff; commercial pause1 with latent cap25/day and global ceiling1,000. Shadow customer projection/publication rows0; shadow publication remains disabled.

Pi transport is healthy: latest authenticated poll **16:33:46 London**, recent intervals913/913/914 seconds and cadence verified. Latest new receipt remains12:57:43 and source check12:39:57 London. The source aggregate has just exceeded its existing four-hour warning threshold; **freshness warning is true**. Pending rechecks977, fresh-ack-eligible0. Transport health does not imply refreshed source evidence; no stale timestamp was advanced. Claude should monitor the next discovery/export, using the agreed transport/source distinction. Individual proof expiry remains enforced.

Preservation at **16:39:03 London / 15:39:03 UTC**: **15,811 receipts / 108,819 source facts / 7,077 existing identities** compared; **zero destructive source mutations, identity changes, customer projection or publication rows**. Publication API still403, paid0/bulkoff, protected Pages deployment and V2 schedules unchanged.

## Exact provider dependency

Chris/Hal recorded the fresh LIVE product, three prices and dedicated Portal in [the provider handoff](findpitches-v3-live-stripe-config-2026-10-11.md). Codex will adopt those exact objects; the tool's normal path cannot recreate them. Only the missing dedicated webhook is created after canonical configuration reads. The stable native Worker webhook URL works independently of the apex route, supporting customer-safe rollback.

The old preview TEST key returns a different account ID from the explicitly approved LIVE handoff. TEST objects/key are not promoted or used as LIVE account proof. LIVE verification targets the exact Chris/Hal account/objects. A restricted LIVE key may deny `/account`; reading all approved globally unique LIVE object IDs, without a Connect header/account fallback, independently proves access to the operator's named account. The approved account identity remains explicit operator custody.

The supplied path **`/tmp/findpitches-v3-stripe-live.env` is absent on this Codex machine**, as is `/tmp/findpitches-v3-production.env`. A `/tmp` path on Hal/OpenClaw's host is not a transfer into this filesystem. No LIVE Stripe key is locally accessible and Codex has made **zero LIVE provider reads/writes**.

`SMTP2GO_API_KEY` exists as an environment **proxy reference**, not a raw transferable Worker credential. The preview's native secret works, but Cloudflare will not export it. The new production Worker needs the raw existing SMTP2GO key securely bound. Keep sender `hello@findpitches.com` and the existing verified account/domain; no new sender/account is needed.

**Minimal remaining input:** securely transfer the operator's 0600 env file into this Codex environment, with `STRIPE_SECRET_KEY`; include `V3_EMAIL_API_KEY` containing the existing raw SMTP2GO key, or bind that mail key directly to the new production Worker. An attached secure env file can be downloaded privately here. Never paste key values into chat or GitHub.

## Completion sequence and rollback

1. Read the secure file as data; independently verify Hal's exact LIVE product/prices/Portal. Create only the owned webhook at `https://findpitches-v3-customer-production.ctucker.workers.dev/api/v3/stripe/webhook`; store its signing secret privately and bind native LIVE credentials. Verify the existing mail domain without sending an arbitrary test email.
2. Redeploy gated; freeze final versions/READY/customer/queue/producer/provider baseline and publish complete preflight. If a restricted-key permission is missing, identify only that precise operator step.
3. Apply only `findpitches.com/*` and `www.findpitches.com/*` Worker routes in the FindPitches zone. The recorded plan changes **no DNS record and no shared Pages object**. Immediately verify `pitchlist.uk` and prior Pages deployment unchanged.
4. Open approved public access/indexability; smoke the real hostname's public/auth/security/Free redaction. Enable new Checkout only after all exact LIVE configuration checks pass. Prove the controlled genuine hosted LIVE journey with a real operator/card, never synthetic LIVE customer objects.
5. Keep paid acquisition, alert sending, legacy migration, UKCraftFairs Option B, destructive legacy changes and protected/live merges closed.

Rollback closes new Checkout first and retains LIVE mappings/key/database/webhook/Portal. With LIVE customers, keep the FindPitches routes and account-recovery path; hide unsafe catalogue/indexability with the existing controls. Only before any LIVE mappings exist can exact newly-added route IDs be removed to restore recorded prior state. Never delete the shared Pages project or route FindPitches customers into PitchList as substitute billing recovery.
