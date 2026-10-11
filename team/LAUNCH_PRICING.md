# FindPitches V3 launch pricing and currency selection

Updated: 2026-10-11T16:14:00+01:00
Authority: Chris / D-014 launch approval plus D-016 global Pro pricing decision.

## Product and entitlement

FindPitches Pro is one global entitlement. A valid Pro subscriber gets all Pro-gated FindPitches opportunities worldwide regardless of customer residence, listing country or the currency used to subscribe.

Launch price variants for the same Pro product:

- GBP: **£4.99/month**
- USD: **$6.99/month**
- EUR: **€5.99/month**
- First subscription trial: **7 days**

Currency is billing presentation only; it must not create geographic entitlement silos.

## Currency shown to customers

At launch, FindPitches should automatically default to the appropriate billing currency for the customer's market/locale:

- United Kingdom -> GBP / £4.99
- United States -> USD / $6.99
- Ireland and supported euro-area markets -> EUR / €5.99

The selected price shown on FindPitches and the Stripe Checkout price ID must match. The customer should be able to switch among the supported launch currencies if needed rather than being permanently locked to the automatic choice.

The application must treat the three Stripe prices as currency variants of one FindPitches Pro plan. Whichever supported currency is paid, entitlement is simply **Pro = global access**.

Do not infer entitlement from currency, IP country, listing country or Stripe price geography. Do not create GB Pro, US Pro or EU Pro memberships.

Additional local currencies such as CAD, AUD and NZD may be added later without changing entitlement semantics; they are not launch blockers.

## Stripe object policy

Use the existing Stripe account but create fresh FindPitches V3-owned LIVE objects. Do not reuse or modify PitchList products, prices, customers, subscriptions, webhooks or Portal configuration.

Expected LIVE setup:

- one product: `FindPitches Pro`
- three recurring monthly prices under that product for GBP 4.99, USD 6.99 and EUR 5.99
- dedicated FindPitches V3 LIVE webhook endpoint
- dedicated FindPitches V3 Billing Portal configuration
- strict TEST/LIVE separation
- global Pro entitlement after canonical LIVE subscription verification

Suggested price lookup keys:

- `findpitches_v3_pro_gbp_monthly`
- `findpitches_v3_pro_usd_monthly`
- `findpitches_v3_pro_eur_monthly`

Suggested product metadata:

- `app=findpitches`
- `version=v3`
- `plan=pro`
- `entitlement=global`

No market restriction metadata should be attached.

## Checkout remains gated until verification

Creating the LIVE Stripe product/prices/webhook/Portal configuration does not itself expose Checkout. Checkout stays closed until Codex verifies the exact LIVE account, product, all three price IDs/amounts/currencies/intervals, webhook ownership/signature path, Portal configuration and global-entitlement behaviour.

A LIVE customer, Checkout Session or subscription should not be created merely to configure Stripe. The controlled production checkout proof comes after V3 verifies the configuration and launch runtime.