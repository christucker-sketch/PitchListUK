# FindPitches Stripe branding — provider decision

The owner completed the real signup and cancellation journey. Read-only native/provider evidence confirms a newly created V3-owned customer, the approved £4.99 global Pro product, a seven-day trial, £0 Checkout total, cancellation at trial end and matching global trial access through23October2026. This is V3's dedicated Portal configuration, with its own FindPitches headline. The PitchList logo, business name and orange are inherited account branding. The screenshot shows Stripe Link; its saved payment details/verification can be reused across Stripe merchants without migrating a PitchList customer into V3.

[Sanitized acceptance evidence](../operations/findpitches-v3/reports/owned-live-acceptance-2026-10-16.json).

## Scoped Checkout change already being built

New V3 hosted Checkout sessions will explicitly set FindPitches display name, the approved existing logo/mark, cream background and dark green buttons. No Stripe account branding or PitchList setting changes. Existing sessions retain their original appearance and idempotency history.

Stripe documents `branding_settings` in the2025-09-30.clover Checkout creation contract. Only that request changes API version; canonical subscription reads and webhook handling retain2024-06-20. Full runtime tests, existing account/cancellation recovery and one genuine hosted **TEST-only** visual check are required before restoring new Checkout after the guarded release. No extra LIVE test customer/session/subscription/charge is to be created by Codex.

## Why the Portal needs a separate decision

Stripe's Portal configuration API supports a headline, policy URLs, feature settings and return URL. It does not expose independent logo/colour/business-name settings for each configuration. Stripe's Portal documentation directs ordinary accounts to account-level Dashboard branding. Its Connect `on_behalf_of` option changes subscription/account visibility; it is not a cosmetic switch and must not be bolted onto existing subscriptions to change colours.

Changing the current account branding would also affect protected live PitchList. The standing instruction to preserve PitchList and reuse the existing Stripe account does not authorize that shared change or creating/migrating to a different financial account. No shared branding edit, new account or migration has been made.

## Available directions

| Direction | Customer result | Engineering/operator consequence |
| --- | --- | --- |
| Separate FindPitches Stripe account (recommended for full provider separation) | FindPitches branding on Checkout, Portal and future provider documents | Hal sets up the approved business account using the existing legal business where appropriate; Chris completes required business/2FA checks. Codex must preserve the existing V3 trial and historical billing access while adding explicit account-aware credentials, immutable ownership and exact price/product policy. No blind key swap or silent customer/subscription migration. |
| Keep the account; build V3 billing management | FindPitches account screen handles cancellation/resume and owned invoice/card actions; future card updates use branded hosted setup Checkout | More billing code, owner/CSRF/idempotency tests and possibly narrowly scoped Stripe permissions. Shared Stripe business/document identity still belongs to the existing account. Existing Portal remains available as a recovery route until the replacement is proven. |
| Keep the Portal appearance temporarily | New Checkout gets V3 branding; Portal continues showing shared PitchList branding | Smallest immediate scope, but does not meet full visual separation. No account migration or extra billing implementation. |

The operator must choose a direction before account setup, account-wide brand changes or a billing-UI replacement. A separate Stripe account is not a new legal company, but its business verification, banking and terms must be completed by the authorized operator; no invented business details or account opening is performed automatically.

## Hal's next role after the decision

Hal owns provider custody only after his own acknowledgement of a concrete task. Read the hub and record the selected direction before changing anything. For the separate-account option, prepare exact account identity, business/public support details, FindPitches branding, owned GBP/USD/EUR monthly Pro prices, dedicated Portal and webhook settings. Preserve every existing PitchList object and the current FindPitches trial/cancellation/invoice history. Codex owns runtime/account-aware integration and guarded activation. Do not paste raw keys in the public hub or chat.

## Official references checked16October2026

- Checkout appearance and `branding_settings`: https://docs.stripe.com/payments/checkout/customization/appearance
- Versioned Checkout API: https://docs.stripe.com/api/checkout/sessions/create?api-version=2025-09-30.clover
- Portal configuration and account branding: https://docs.stripe.com/customer-management/configure-portal
- Portal configuration fields: https://docs.stripe.com/api/customer_portal/configurations/create
- Official Stripe OpenAPI schema: https://github.com/stripe/openapi/blob/master/openapi/spec3.json
