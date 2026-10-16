# LIVE signup incident — 16 October 2026

The genuine signup attempt successfully consumed its one-use link, created a valid customer session and returned to its saved pricing path. Checkout then failed before any Stripe customer link, Checkout attempt, reservation or subscription existed. This blocks all new customers using the same restricted credential; it is not an isolated bad reservation.

Production D1 shows one link sent/consumed, one linked active session and two service-unavailable events immediately afterwards. No personal account fields or tokens are exported here. The unchanged deployed Worker passed canonical product, all three LIVE price and dedicated Portal configuration reads. Those reads do **not** prove customer/write permissions or hosted trial acceptance.

The securely retained production credential returned HTTP403 `more_permissions_required` for Customer read and write. Nonexistent-resource probes for subscription reads, Checkout writes and Portal writes returned `resource_missing`; no provider object, sign-in message or charge was created. The actual deployed credential is being checked through the new operator-only capability endpoint after release; stored-key evidence alone is not described as native-secret proof.

## Operator action

Hal/Chris: change **Customers** on the existing V3 restricted LIVE key to **Write**, including Read, preserving all other restrictions. No new Stripe account, product, price, sender or key is required. Keep raw keys out of chat/GitHub. Codex has requested this configuration change and will recheck native capability evidence before reopening Checkout. This environment has no Stripe key-permission management capability.

## Containment and reversible runtime work

At 13:42 London, only new Checkout was closed. Public browsing, sign-in and account recovery stayed available; customer storage, provider objects, routes, DNS, source/Pi and protected PitchList/V2 were unchanged.

- Stripe failures retain only a fixed operation, HTTP status, allowlisted error code and validated provider request ID. Provider messages, raw URLs, personal data and key fragments never enter these diagnostics or customer responses.
- `/ops/billing/capabilities` checks actual deployed permissions using nonexistent resources and empty updates. It creates no customer, Checkout session or subscription. It explicitly does not claim a completed owned LIVE journey.
- The launch controller requires complete native Customer/billing capability evidence before enabling Checkout; price-only preflight is insufficient.
- Pricing shows the authenticated account clearly after return from email. It still requires an explicit customer click to enter hosted Checkout.
- Identity, mode, product/price, CSRF, ownership, trial, reservation/idempotency, webhook and entitlement checks remain enforced.

## Validation checkpoint

Full V3 suite: **472 passed, 0 failed/skipped**. Final focused production/launch checks: **24 passed**, including the subsequently added launch-capability gate. Frontend contract: **3 passed**; independence **93 files**; build **56 files**; runtime boundaries passed. Public security/API/SEO checks with Checkout closed: **29/29** before release. Guarded production code/assets release and final native/public checks are in progress; no deployed-fix or successful real trial claim yet.

V3-010 remains open. After the permission change, verify the native credential, re-open only under the existing approved launch scope, and ask Chris to repeat email → authenticated pricing → LIVE hosted Checkout → seven-day trial → global Pro → Portal/cancel/paid-through. No account impersonation or test charge. V3-029 performance work remains paused for this P0.
