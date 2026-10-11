# FindPitches V3 LIVE Stripe configuration checkpoint

Recorded from Chris's operator handoff on 2026-10-11 after Hal/OpenClaw completed the provider-side setup. This file contains no secret values.

## Account and product

- Existing LIVE Stripe account ID: `acct_1TTp8UEIdSfbjtdo`
- Account display name was not readable with the restricted key; account identity was matched by the existing LIVE PitchList products already present in the account.
- New FindPitches LIVE product: `FindPitches Pro`
- Product ID: `prod_VQF2oqHreWwhOj`
- Product/price metadata represents one global Pro entitlement; billing currency does not constrain catalogue market access.

## LIVE recurring prices

All three prices belong to the same FindPitches Pro product and bill monthly:

- GBP: `price_1UPOYoEIdSfbjtdokwYZebsp` — GBP 4.99 / month
- USD: `price_1UPOYoEIdSfbjtdoDVzOaxpQ` — USD 6.99 / month
- EUR: `price_1UPOYoEIdSfbjtdov30fVN2j` — EUR 5.99 / month

The intended first-subscription trial is 7 days. Repeat-trial eligibility remains an application-level responsibility.

## Billing Portal

Dedicated LIVE FindPitches V3 Portal configuration:

- Configuration ID: `bpc_1UPOZ7EIdSfbjtdoUSK1A5h9`
- Active and non-default
- Cancellation: at period end
- Payment-method updates: enabled
- Invoice history: enabled
- Subscription switching: disabled, preventing cross-product switching into PitchList products/prices
- Return URL: `https://findpitches.com/account.html`

## Webhook status

A LIVE webhook endpoint has **not yet been created**.

Staged endpoint URL:

`https://findpitches.com/api/v3/stripe/webhook`

Reason for holding creation: at the time of provider setup the URL fell through to the site shell and the production FindPitches Worker had no matching webhook handler. Creating the Stripe endpoint at that point would have targeted a knowingly dead endpoint.

Planned events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Potential additional lifecycle events for Codex to review when the handler is ready:

- `customer.subscription.trial_will_end`
- `invoice.payment_action_required`
- `invoice.finalization_failed`

No webhook signing secret exists yet because Stripe issues it when the endpoint is created.

## Isolation / safety confirmation

Provider-side operator report states:

- zero existing PitchList objects modified;
- the two known PitchList product snapshots remained unchanged;
- zero customers created;
- zero Checkout Sessions created;
- zero subscriptions created;
- zero charges or payments attempted;
- no Checkout exposure, payment links, DNS changes, Cloudflare routing changes or repository code changes were made by Hal during this provider setup.

The operator retained the LIVE restricted key and configuration handoff locally in a protected temporary environment file with mode `0600`. Secret material is not recorded in GitHub.

## Next required step

Codex should verify the product and three price IDs against the production runtime, complete the LIVE webhook handler, then request/create the Stripe webhook only once the real endpoint is reachable and signature verification/storage are ready. Checkout remains closed until that verification is complete.
