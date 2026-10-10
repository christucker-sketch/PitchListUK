# Subscriber recognition and hosted TEST journey: next implementation checkpoints

**Historical design checkpoint (12:29 London).** The later [implemented recognition and browser evidence](findpitches-v3-subscriber-recognition-2026-10-10.md) supersedes the implementation/trust status below. TEST recognition now passes; native TLS works; hosted Stripe remains blocked by proxy egress. This earlier design is retained for review history.

Codex owns V3-004 and V3-005 on `findpitches-v3/greenfield`. This checkpoint records inspected code and a concrete implementation/test sequence; it is **not a completed migration or hosted checkout claim**. Publication, production cutover, live billing and customer migration remain disabled. No additional email is authorized.

## V3-004: controlled subscriber recognition

V3 currently recognizes only its own canonical Stripe TEST ownership metadata. [`customer-billing.mjs`](../platform/findpitches-v3/customer-billing.mjs) requires exact native customer ID and verified email, approved TEST price and GB scope. The owned customer schema enforces TEST-only Stripe mappings. There is no recognition/import endpoint or reviewed legacy association ledger yet.

Read-only reference inspection of [`functions/api/billing/checkout.js`](../functions/api/billing/checkout.js) and [`functions/_lib/stripe.mjs`](../functions/_lib/stripe.mjs) shows a different legacy identity vocabulary: `pitchlist_database`, `vendor_id`, email-indexed KV and canonical subscription/customer bindings. These files describe the repository reference; this checkpoint did not inspect or import live subscriber rows or prove which code version is live. V3 must not adopt legacy cookies/KV or blindly match a Stripe customer by email.

Implement the first increment entirely with synthetic TEST identities:

1. Define an operator-reviewed association manifest binding an exact native account, canonical Stripe customer/subscription, provider mode, approved product/price and market. Retain custody and review provenance in owned V3 storage. A matching email alone is insufficient; native mailbox verification plus a defensible original ownership association are required.
2. Add an append-only recognition decision ledger with unique ownership constraints. Resolve canonical provider ownership and current subscription state before activating a mapping. Replaying the same association must reuse the mapping; an attempt to bind another owner or swap identity must fail closed with an explicit review outcome.
3. Read Stripe directly for recognized subscriptions without modifying existing provider ownership metadata or subscription objects. Native V3 storage must contain everything needed for runtime recognition; no V1/V2 API, KV, session or deployment may be required.
4. Prevent Checkout for unresolved recognition candidates, active/trialing subscriptions and payment-problem states. An unrecognized price or incomplete registry coverage must not mean “new customer.” Add market/product coverage evidence before any future live new-customer checkout can be considered safe.
5. Preserve canonical cancellation, paid-through access and expiry; require fresh verification and approved product/market. Do not introduce a second trial for a recognized prior subscriber.

The existing TEST-only price policy stays unchanged in the first increment. Legacy/live price acceptance and actual subscriber import are separate gated work; this proposal does not authorize them.

| Case to prove with synthetic TEST fixtures | Required outcome | Current evidence |
| --- | --- | --- |
| Approved exact ownership association | One native mapping and canonical entitlement | Recognition path not implemented |
| Same manifest replay / concurrent replay | Same mapping; no extra Stripe customer or subscription | Recognition path not implemented |
| Verified email matches but ownership association absent | Review; no automatic association or charge | Design requirement |
| Another native owner / reused subscription / switched customer | Reject or quarantine; preserve prior mapping | Design requirement |
| Unapproved product, market, price or mode | No access; no duplicate Checkout as a fallback | Native TEST mode/market coverage exists; recognition coverage missing |
| Active/trialing or payment-problem subscriber requests Checkout | Refuse second subscription | Existing owned-account path tested; recognition coverage missing |
| Scheduled cancellation before paid-through end | Retain access through authoritative end | Existing entitlement test passes |
| Immediate cancellation, expiry, stale canonical check | Redact Pro application access | Existing entitlement test passes |
| Legacy systems unavailable | Native runtime keeps working or safely denies unknown association | Existing independence architecture; recognition test pending |

**Next coding checkpoint:** implement the TEST-only reviewed association ledger and canonical recognition adapter, then test replay, ownership mismatch, duplicate Checkout and cancellation/expiry. Do not create live mappings or mutate legacy/provider production data to make tests pass.

## V3-005: hosted Stripe TEST browser journey

Playwright, system Chromium, an existing Stripe TEST key, approved TEST price and owned TEST portal configuration are available. No new secret or sender setup is needed. Existing API-based customer verification creates subscriptions using provider test-card APIs; [`native-preview.py`](../web/findpitches-v3-web/tests/native-preview.py) blocks third-party navigation. Neither proves a hosted checkout.

A fresh browser capability probe on 10 October reached a concrete environment issue: navigation to the real preview origin failed with `ERR_CERT_AUTHORITY_INVALID` through the environment proxy. Navigation to the bare Stripe Checkout origin also failed; its detailed cause was not established. No authenticated Checkout session, card entry or payment was attempted. No insecure browser override was used.

**Hosted journey is blocked on a browser that validates the environment's proxy certificate at the real origin.** A loopback relay can support UI checks but cannot count as genuine real-origin cookie, redirect or hosted-payment evidence. System certificate changes were not attempted in this checkpoint.

Once verified browser trust is available, add a dedicated bounded journey harness with synthetic reserved TEST identities and private access state:

1. Establish a native test session using the existing operator-only reserved-domain mechanism, which sends no email. Verify free access/redaction first.
2. Start Checkout through the frontend and follow its actual hosted `cs_test_…` session using Stripe's documented test card. Record actual completion/return, not API-created subscription success.
3. Confirm the exact completed session owner/subscription and GB entitlement; reject replay by another account and cross-market access. Canonical provider state remains the authority.
4. Enter the owned TEST billing portal in the browser and schedule cancellation. Verify paid-through access and application links until the canonical end.
5. Demonstrate actual end-of-period expiry using an isolated provider TEST clock if supported by the hosted flow. If it is unsupported, retain expiry as separately evidenced backend coverage and leave the hosted temporal step open; never manufacture a provider period end in customer storage.
6. Retain sanitized results only. Cookies, sign-in links, hosted session/portal URLs, screenshots containing identifiers and provider responses stay in private artifacts. Allow only the necessary V3 and Stripe origins; assert zero V1/V2, live-mode objects, real charges or additional emails.

**Next capability checkpoint:** resolve the browser's verified certificate trust, then exercise one bounded hosted TEST journey. Keep the task open/blocked until actual browser evidence exists.

## Validation in this checkpoint

Focused existing customer tests passed **11/11** under Node 22. They cover sessions/CSRF, mode/market/expiry, redaction, signed webhooks/canonical rereads, owned Checkout idempotency and portal ownership. No new recognition code or hosted-browser success is claimed by those results. The full V3 suite was not rerun because this checkpoint changes documentation and sanitized reports only.

No cloud deployment, mail send, paid acquisition, customer import, live Stripe change, publication or cutover was made. [Lifecycle cloud inspection](findpitches-v3-lifecycle-cloud-checkpoint-2026-10-10.md) supplies separate supporting evidence for Claude-owned V3-001.
