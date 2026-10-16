# Codex open-task consolidation order — 16 October 2026

Owner: ChatGPT/Chris
Branch: `findpitches-v3/greenfield`

Codex is running into usage limits, so stop parallelising across multiple nice-to-have threads. Consolidate all currently open Codex-owned work into one ordered queue and attack it in this sequence. Preserve completed checkpoints; do not reopen closed tasks unless a regression is proven.

## Priority 1 — Billing / branding / native FindPitches billing management

Finish V3-030 first. Treat Chris's owned LIVE signup/trial/global-Pro/cancel journey as functionally proven and update stale status text accordingly.

Scope:
- Complete FindPitches-specific Checkout branding without changing shared Stripe account branding.
- Build a native FindPitches Billing page rather than relying on the PitchList-branded hosted Billing Portal as the primary UX.
- Native page should, where safely supported, show current plan, trial/renewal/end date, cancellation state and payment-method summary, and support essential subscription actions such as cancel-at-period-end and resume.
- Use Stripe APIs and Stripe-hosted/embedded secure components for sensitive payment-method changes; do not move card handling into our code.
- Preserve the existing shared Stripe account, approved products/prices, 7-day trial, global Pro entitlement, webhook semantics, identity/idempotency/CSRF protections and PitchList isolation.
- Hal is only a narrow provider-side dependency if a Stripe setting or restricted-key permission cannot be completed natively by Codex.

Do not create a new Stripe account, migrate customers, or change shared account branding without fresh explicit authority.

## Priority 2 — V3-029 performance

Resume the paused performance task immediately after Priority 1 is stable.

Do a measured performance profile, not speculative tuning:
- homepage/catalogue/search/country/listing/map/account/billing paths separately;
- break latency into Worker execution, D1/query time, service-binding/API time, cache behaviour and frontend sequencing/render cost;
- identify the top real bottlenecks;
- fix highest-impact read paths first;
- prefer bounded customer read models/precomputation/caching where justified rather than repeatedly traversing proof/history state;
- publish before/after measurements from the real public origin.

Target: ordinary catalogue API reads should be sub-1s where practical, preferably a few hundred ms on cache hits. User-perceived snappiness matters more than synthetic test success.

## Priority 3 — V3-022 storage 48/72-hour verdict

Complete the existing 48/72-hour hot-growth measurement and publish the actual growth/runway conclusion.

Do not launch a storage migration merely because an earlier provisional rate looked high. Use the completed measurements to decide whether D1+R2 remains acceptable for the current growth envelope. If not, publish a concrete migration recommendation with trigger thresholds; do not start a PostgreSQL/sharding migration without separate authority.

## Priority 4 — V3-020 broader French proof

After the commercial/runtime items above, continue the French organiser/council/PDF proof work so Claude's producer output can become safe V3 READY inventory.

Keep proof/identity/date/geography strict. Do not infer FR readiness from producer candidates. Preserve original-language evidence and document custody. France remains commercially useful only when proof passes the same evidence standard as existing markets.

## Priority 5 — V3-028 upcoming listings / Save

Only after Priorities 1–4 are complete/stable, continue customer upcoming/future-listing and Save functionality.

This is valuable but not currently a revenue/reliability blocker.

## Explicitly deprioritised for Codex usage

Do not spend scarce Codex usage right now on additional map expansion, Germany activation, localisation polish, more SEO embellishment, legacy migration, alerts, or producer acquisition work that Claude/Pi owns unless one of those becomes a direct blocker to the ordered tasks above.

## Task hygiene

At the start of the next Codex session:
1. Reconcile `team/agents/CODEX.md`, `team/CURRENT_STATUS.md`, and any open task notes against this order.
2. Mark stale statements as superseded where later evidence exists — especially owned LIVE Stripe acceptance, which Chris has completed and Codex has independently verified.
3. Publish one compact ordered backlog with status: `ACTIVE / WAITING / DONE / DEFERRED`.
4. Work one priority at a time until a safe checkpoint is published, instead of opening more parallel threads.
5. If usage headroom is low, publish exact resume point and evidence before stopping.

No paid acquisition authority. PitchList/V2 remain untouched. No secrets in hub files.
