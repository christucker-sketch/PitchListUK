# LIVE signup incident — 16 October 2026

**Blocked on the existing Stripe key’s Customers permission.** At 2026-10-16T13:55:22+01:00, the deployed production Worker confirms HTTP403 `more_permissions_required` for Customer reads and writes. New Checkout remains closed; public browsing, sign-in and account recovery stay available. The reversible runtime changes are deployed and verified. This incident is **not resolved** and V3-010 is not complete.

## Cause and actual attempt

The real one-use email link was consumed, created a linked valid session and returned to its saved pricing path. Two service-unavailable events followed. Production D1 has **zero** Stripe customer links, Checkout attempts, reservations and subscriptions. Checkout was failing before its first Stripe customer could be created; this permission restriction affects every new customer using the credential, rather than one stuck account/reservation.

Canonical product, all three approved LIVE prices and dedicated Portal configuration reads succeed. Those earlier preflight checks did not exercise Customer access; they were insufficient evidence of working subscription creation. The failure was then flattened into a generic unavailable response, hiding its useful provider cause. The saved pricing redirect itself is expected; its authenticated state needed a clearer presentation.

No personal account fields, source customer records, credentials, cookies or sign-in links are exported. [Sanitized native evidence and validation](../operations/findpitches-v3/reports/live-signup-incident-2026-10-16.json).

## Required configuration action

**Hal/Chris: edit the existing V3 restricted LIVE Stripe key and set Customers to Write, including Read. Preserve every other restriction.** No new key, product, price, Stripe account or sender setup is needed. Keep raw keys out of chat/GitHub. This environment has no Stripe key-permission management capability; the action was requested through the session’s configuration question.

After the change, Codex must repeat the native operator capability check and fresh public/guarded-reopening checks. Do not reopen merely because product/prices pass or because the hub has been updated. The real owned email → authenticated pricing → LIVE Checkout → seven-day trial → global Pro → Portal/cancel/paid-through journey remains Chris’s acceptance step. No account impersonation or test charge has been performed.

## Deployed changes

- Provider failures retain only a fixed operation, HTTP status, allowlisted error code and validated Stripe request ID in V3 customer telemetry. Raw provider messages, customer URLs, personal information and key fragments are excluded; customer-facing errors remain redacted.
- Operator-only `/ops/billing/capabilities` tests the actual deployed credential without creating provider objects. Read checks require successful, empty pre-epoch-filtered lists. A missing-resource GET is insufficient permission evidence. Empty updates target nonexistent Customer/Checkout IDs; Portal probes name a nonexistent customer. The response explicitly says the owned trial journey is unproven.
- The launch controller requires complete native Customer/billing capability evidence before enabling Checkout. Missing/duplicate/denied read/write evidence and price-only reports fail closed. Missing-resource write probes observe denial behavior; they do not replace actual owned hosted acceptance.
- Pricing clearly displays the signed-in account after email return. Hosted Checkout still requires an explicit customer click.
- Ownership, LIVE mode, exact product/price, CSRF, identity, seven-day trial, reservation/idempotency, webhook and global entitlement checks remain enforced.

Final customer Worker **`b4fb82d0-7728-49a2-9890-a9883175939d`**, deployment **`4985dce6-c5ce-4e8d-bfd7-1d66f8b3bf99`**, code commit **`67237e20`**. Code/assets uploaded and activated with all native bindings/secrets/settings/schedules, existing routes/DNS and protected PitchList deployment preserved. No migration, secret replacement, source Worker/Pi release or V2 change. Only the existing new-Checkout flag was closed at13:42London; it remains closed.

## Validation and remaining work

| Check | Result |
| --- | --- |
| Final full V3 suite | **473 passed; 0 failed/skipped** |
| Frontend contract / independence / build | 3 passed; 93 files scanned; 56 files built |
| Runtime boundaries | Passed |
| Authenticated local desktop/mobile pricing, EN/FR/DE | 6 combinations passed; provider network forbidden |
| Final real public security/API/SEO | **29/29 passed**, Checkout closed |
| Deployed pricing JavaScript | Exact hash match to checked source |
| Actual native Customers read/write | **Blocked, HTTP403 more_permissions_required** |
| Actual native subscription read | HTTP200 empty filtered list |
| Nonexistent Checkout / Portal write probes | Missing-resource responses; no objects created; real journey unproven |
| Provider customer links / Checkout attempts / reservations / subscriptions | 0 / 0 / 0 / 0 |
| Investigation-created provider objects / messages / charges / Serper queries | 0 / 0 / 0 / 0 |

V3-010 remains blocked on the permission correction and genuine owned acceptance. V3-029 performance work remains paused. Paid acquisition, source publication and unrelated launch gates were not enabled. Original source evidence and source identity were not written by this work; no new global source-custody audit is claimed. Commercial inventory was not fully remeasured during this customer incident.
