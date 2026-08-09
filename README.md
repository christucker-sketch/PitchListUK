# PitchList UK

Static public landing page for `pitchlist.uk`.

## Local build

```bash
npm run check
npm run build
```

Cloudflare Pages should publish the `public/` directory.

## Recommended Cloudflare Pages settings

- Framework preset: None / Static HTML
- Build command: `npm run build`
- Build output directory: `public`
- Production branch: `main`

## Legacy Sample Request Endpoint

The public homepage no longer links to a sample request funnel. Customers should preview locked rows in `/database`, then start the Stripe trial if coverage looks useful. `/api/sample-request` is retained as a legacy/support intake route only.

Configure at least one delivery path in Cloudflare Pages environment variables:

- `PITCHLIST_FORM_SMTP2GO_API_KEY` - SMTP2GO API key for legacy/support intake email
- `PITCHLIST_FORM_TO` - destination inbox, defaults to `hello@pitchlist.uk`
- `PITCHLIST_FORM_FROM` - verified sender, defaults to `hello@pitchlist.uk`
- `PITCHLIST_SAMPLE_WEBHOOK_URL` - optional webhook endpoint instead of SMTP2GO
- `PITCHLIST_SAMPLE_WEBHOOK_TOKEN` - optional bearer token for the webhook

## Stripe Subscription MVP

The database preview can unlock full source/application routes through Stripe Checkout.

Stripe account setup needed:

1. Create product: `PitchList Database Access`.
2. Create recurring monthly price: `GBP 4.99`.
3. Enable Customer Portal in Stripe Billing settings.
4. Create a webhook endpoint: `https://pitchlist.uk/api/billing/webhook`.
5. Subscribe the webhook to:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`

Cloudflare Pages environment variables:

- `STRIPE_SECRET_KEY` - Stripe secret key.
- `STRIPE_PRICE_ID` - recurring GBP 4.99 monthly price ID.
- `STRIPE_WEBHOOK_SECRET` - webhook signing secret.
- `STRIPE_TRIAL_DAYS` - optional, defaults to `7`.
- `PUBLIC_BASE_URL` - optional, defaults to current request origin.
- `PITCHLIST_DATABASE_ACCESS_CODE` - optional admin/manual override access code.
- `PITCHLIST_DATABASE_PUBLIC_FULL_ACCESS=true` - optional local/demo bypass only; do not enable in production.
- `PITCHLIST_ACCESS_KV` - optional Cloudflare KV binding used by webhook access records.
- `PITCHLIST_VENDOR_KV` - optional Cloudflare KV binding for PitchList vendor profiles; falls back to `PITCHLIST_ACCESS_KV` when separate storage is not configured.
- `PITCHLIST_ANALYTICS_TOKEN` - private token for `/activity` and `/api/analytics/summary`.
- `PITCHLIST_ANALYTICS_KV` - optional Cloudflare KV binding for first-party activity events; falls back to `PITCHLIST_ACCESS_KV`.

Runtime flow:

1. `/database` shows a searchable redacted preview by default.
2. `/api/billing/checkout` creates a subscription Checkout Session with a 7-day trial and card collection.
3. Stripe redirects to `/database?session_id=...`.
4. `/api/billing/session` verifies the Checkout Session and stores a short access cookie.
5. `/api/customer-opportunities/search` shows full source/application routes for valid trialing/active subscriptions.
6. `/api/billing/portal` opens the Stripe Customer Portal for cancellation/card updates.

## Activity Monitor

Campaign/site activity is tracked first-party through `/api/analytics/event`.

Tracked signals:

- page views with referrer host and UTM/campaign params
- `/database` searches, including postcode/outcode, radius, category, access mode and result count
- checkout starts, Stripe redirects, checkout returns, access-link requests and shortlist actions
- recent events and campaign/referrer/page aggregates in `/activity`

Open `/activity`, enter `PITCHLIST_ANALYTICS_TOKEN`, and choose the reporting window. The monitor stores hashed visitor/session signals and does not store raw IP addresses.

## Vendor Profile Backend

PitchList owns the vendor profile; Stripe only owns billing.

Backend endpoints:

- `POST /api/vendor-profile/signup` creates a vendor profile seed and sets a secure edit cookie.
- `GET /api/vendor-profile/me` returns the current vendor profile from the edit cookie or `?token=`.
- `PUT /api/vendor-profile/me` updates editable vendor profile fields.
- `GET /api/vendors/search` returns public opt-in vendor profiles for the future organiser-facing directory.

Stripe integration:

- `/api/billing/checkout` accepts a `vendor_profile` object or top-level signup fields.
- The checkout session uses `client_reference_id` and Stripe metadata to carry `vendor_id`.
- Webhooks sync Stripe customer/subscription status back onto the PitchList vendor profile.

Recommended minimum signup fields:

- `business_name`
- `contact_name`
- `email`
- `phone`
- `base_postcode`
- `specialty`
- `regions`
- `public_listing_opt_in`

Keep the pre-payment form short. Use the post-checkout profile page to collect richer public listing fields such as description, photos/logo, dietary tags, setup type, power/water needs, licence/insurance notes and preferred event types.

## Boundaries

This repo is public-site only. Do not commit HAL back-office files, prospect CRM state, credentials, inbox exports, or private customer exports here.
