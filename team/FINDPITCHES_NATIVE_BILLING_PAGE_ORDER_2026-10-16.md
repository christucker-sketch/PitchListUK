# FindPitches native billing page — implementation order

Owner: **Codex**
Provider-side assistance: **Hal only if required for Stripe account/key configuration**
Claude/Pi: **out of scope**

Chris approved the direction: keep the existing shared Stripe account for now, but stop relying on the account-branded hosted Billing Portal as the primary FindPitches customer-management experience.

## Objective

Build a **FindPitches-native Billing / Subscription page** inside the existing V3 customer application, with Stripe remaining the billing engine underneath.

The page should preserve existing V3 subscription ownership, global Pro semantics, pricing, trial, webhook handling, cancellation state, paid-through access and idempotency. Do not migrate Stripe accounts or touch PitchList customer ownership.

## Customer experience

The FindPitches billing page should show, where source-backed and available:

- current plan / entitlement state;
- price and currency;
- trial end or renewal date;
- cancellation-at-period-end state;
- current paid-through / access-until date;
- payment-method summary where safely obtainable;
- invoice history / receipt links where supported;
- actions for cancel-at-period-end and resume/reactivate when permitted;
- secure payment-method update flow using Stripe-supported hosted/embedded components rather than collecting raw card data in V3.

It should look and behave like FindPitches, not expose PitchList branding during normal subscription management.

## Boundaries

- **Do not** change the shared Stripe account branding globally, because that would affect PitchList.
- **Do not** create a separate Stripe account unless Chris explicitly authorizes it later.
- **Do not** store/process raw card details in V3.
- Use Stripe APIs and supported secure payment components for sensitive payment actions.
- Preserve the already-proven owned LIVE FindPitches customer/subscription/trial flow and its history.
- Preserve global Pro entitlement across GBP/USD/EUR.
- Preserve trial/cancel/paid-through semantics and fail closed if canonical Stripe state cannot be verified.
- Keep PitchList routes, data, Stripe objects and customer ownership untouched.
- No Claude/Pi changes.

## Acceptance

Before calling this complete, prove in guarded production or a provider-safe equivalent:

1. authenticated FindPitches customer can open native Billing;
2. correct V3-owned Stripe customer/subscription is shown;
3. trial/renewal/cancel/access-until values match canonical Stripe state;
4. cancel-at-period-end works and retains paid-through/trial access;
5. resume/reactivate works when applicable;
6. payment-method update uses a Stripe-secure surface and returns cleanly to FindPitches;
7. invoice/receipt access works if implemented;
8. no PitchList object/branding/configuration mutation;
9. existing Checkout and webhook/global-Pro tests remain green;
10. rollback leaves the existing hosted Portal available as emergency fallback if desired.

The hosted Stripe Portal may remain available as a fallback/operator escape hatch, but it should no longer be the default customer-facing subscription-management path once the native page is accepted.

This is a customer-runtime task for Codex. Hal is only needed if a narrow provider-side permission/configuration dependency is encountered.