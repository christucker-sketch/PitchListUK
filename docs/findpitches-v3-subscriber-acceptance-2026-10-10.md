# Existing UK subscriber acceptance package

Scope: V3-004 acceptance input for V3-010. Synthetic TEST recognition is implemented; **real subscriber migration and live billing are not enabled or approved**. Live UK Pitchlist (`pitchlistuk`) was inspected read-only, separately from V2. No customer export, import, email or provider write was performed by this audit.

## What is implemented

The [recognition matrix](findpitches-v3-subscriber-recognition-2026-10-10.md) proves a reviewed, exact native-account → canonical Stripe customer → canonical subscription association. A consumed V3 sign-in challenge establishes the native owner. The operator supplies the exact retained vendor/customer/subscription identity and a custody hash; Stripe must independently agree on ownership, TEST mode, approved price, one item/quantity and market. Matching email alone is insufficient. Provider metadata is not rewritten.

Immutable associations and unique mappings prevent rebinding. Replays converge to the same association. Pending Checkout reservations and database guards prevent a recognition/Checkout race. Recognized accounts cannot start ordinary Checkout, even after their subscription ends; renewal requires its own reviewed design. Native subscriptions with prior history receive no second trial. Account/pricing controls now reflect these rules, including billing-review failures, rather than offering a trial the backend will refuse.

Entitlement uses fresh canonical provider state: active/trialing, supported market/price, authoritative future period end and checked-at bounds. Scheduled cancellation retains paid-through access; ended, payment-problem, stale, unknown or conflicting state stays Free. Application/source URLs remain redacted for Free/cross-market requests. V3 owns its auth, storage, code and association ledger. **No V1/V2 API, KV, cookie or customer database participates at runtime.**

The implemented operator route accepts reserved synthetic TEST identities only. It cannot import the actual registry below. A new unrecognized native sign-in is not proof that no live subscription exists elsewhere; this is why live Checkout and migration remain disabled pending a controlled recognition plan.

## Read-only coverage measurement

Measured **2026-10-10T17:20:39+01:00**, from the production UK subscription registry and its exact customer/email/vendor indexes. [Sanitized aggregate](../operations/findpitches-v3/reports/subscriber-coverage-2026-10-10.json). All requests were GET; the scan is a non-atomic registry snapshot, not a fresh Stripe account audit.

| Registry case | Count | Acceptance implication |
| --- | ---: | --- |
| Total subscription records / distinct customers / distinct emails | 57 / 57 / 57 | Registry population, not verified paying-customer count |
| Cached active / trialing | 27 / 6 | 33 report access; canonical entitlement is still unverified |
| Cached cancelled / past due | 22 / 2 | Cover ended and payment-recovery behaviour without duplicate trial/charge |
| Current rows with scheduled cancellation | 4 | Verify original paid-through end and no accidental renewal |
| Exact customer + email registry index matches | 57 | Useful custody, insufficient without canonical provider ownership |
| Exact vendor/customer/subscription profile bindings | 49 | Original identity available for review |
| Rows without an exact vendor profile binding | 8 | Identity exception review required; three are cached-current |
| Missing authoritative period end | 57 | Existing registry field is empty; no end date may be invented |
| Provider mode / product / price not retained | 57 / 57 / 57 | Each requires fresh provider validation; actual price variants unknown |
| Multiple cached-current records per customer/email | 0 / 0 | Does not prove account-wide provider uniqueness |
| Canonical provider checks / real V3 imports | 0 / 0 | No real continuity claim |

The audit used 280 bounded GET requests, zero legacy writes and zero provider writes. The protected UK deployment was unchanged before/after. A usable LIVE provider credential is not available to this process; the existing Pages secret is opaque. No attempt was made to use TEST credentials against real IDs. The next operator-approved migration preparation needs securely supplied read-only canonical provider access or a fresh authenticated operator snapshot; neither is needed for the separate TEST journey.

## Future comparison inputs and review

1. Capture an authorized read-only snapshot of exact subscription/customer/vendor bindings from the UK registry. Retain encrypted raw evidence outside GitHub; put only aggregates and custody hashes in the hub. Record timestamps and non-atomic limitations.
2. Read each exact canonical provider customer/subscription and all customer-scoped subscriptions with pagination. Verify mode, owner, existing vendor/product metadata, current status, actual product/price/currency/interval/quantity, trial history, period end, cancellation and duplicates. Use original billing identifiers; never infer ownership from email alone.
3. Build an explicit approved legacy-product/price → V3 market/entitlement policy. All 57 mode/product/price/period-end cases remain uncovered. Grandfathered pricing, nonmonthly/multi-item products and payment-problem handling need decisions based on that evidence, not the £4.99 TEST fixture.
4. Prepare a reviewed manifest associating one verified native account with the exact original owner and source custody. Resolve the eight missing vendor bindings and any canonical disagreements individually. Do not create a new subscription/trial as a fallback. Unknowns stay review-only.
5. Before approval, test a bounded dry run and reconcile counts: accepted, held, duplicate, conflicting and no-match must account for the full selected cohort. Prove sign-in, original paid-through access, no second subscription/charge, app-link redaction, renewal/recovery routes and fresh-provider failure behaviour.
6. Chris authorizes the exact real-cohort migration separately. Only then implement/enable the corresponding live adapter and operator route; the present synthetic-only route remains closed to real accounts. No blanket bulk import is implied.

## Review and rollback acceptance

- Review each manifest against canonical ownership and a supported price policy before association. Separate preparation from operator authorization. Record reviewer, time, exact scope and hashes in an append-only audit.
- Stop on mismatches, duplicate active products, missing authoritative dates, unfamiliar prices or provider errors. A stopped record must not open ordinary Checkout or grant inferred access.
- Before execution, prepare a rollback switch to disable further migration and live Checkout, revoke affected V3 sessions, and serve the protected V1 routing while investigation proceeds. Preserve associations/decision history and originals; immutable ledgers are not deleted to roll back. An incorrect association requires an explicit reviewed correction design, never silent rebinding.
- Any custom-domain rollback/cutover or real subscriber write remains an explicit approval gate. Do not cancel/recreate live subscriptions, change provider metadata, move payment schedules or send migration messages as a rollback shortcut.

For ChatGPT: synthetic safety proof plus this package is ready for acceptance review. Actual canonical coverage of all selected subscribers, price policy, reviewed exception handling and an approved live execution/rollback scope remain **NO-GO** gates for real continuity. This package is not launch approval.
