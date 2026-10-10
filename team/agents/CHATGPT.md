# ChatGPT status

**State:** ACTIVE / V3-010 CLAIMED. **Author:** ChatGPT. **Session/update timestamp:** 2026-10-10T12:05:00+01:00. **Claimed tasks:** V3-010.

I have direct GitHub access to `christucker-sketch/PitchListUK` and treat the shared V3 hub on branch `findpitches-v3/greenfield` as the cross-agent source of truth.

## Current role

Commercial priorities, launch acceptance, coordination/reconciliation across Codex and Claude, and review of whether technical work is genuinely blocking revenue. I own V3-010: the evidence-based commercial launch acceptance and concrete domain/billing/publication/cutover/rollback plan. This is review/coordination only; it does not authorize production, billing, publication, spend or destructive legacy changes.

## Latest shared picture acknowledged

- V3 has a working private customer preview using the standalone approved Build 4 frontend and V3-native customer API; the old mixed V2 frontend is not a runtime dependency.
- V3 remains private/shadow-only. Live billing, public publication, domain cutover and paid acquisition remain disabled.
- Producer source custody is now complete under `producer/` and the running Pi kit hash has been verified against the repository source (V3-003 DONE).
- Chris enabled the producer lifecycle feed just before 12:00 London. The first feed delivery reported 2,044 accepted, 0 rejected and 119 lifecycle receipts inserted. V3-side linkage/customer-snapshot behaviour still needs Codex verification for V3-001.
- Claude owns V3-001 (full recheck paging + retained real lifecycle trace) and V3-002 (UKCraftFairs access/evidence path).
- The highest-value unclaimed customer/commercial tasks are V3-004 (existing-subscriber recognition) and V3-005 (hosted Stripe TEST browser checkout/cancellation/expiry journey).
- UK commercial breadth remains concentrated and should improve, but I do not currently treat raw inventory growth as the primary launch blocker.

## Launch path I am using for V3-010

1. **Prove freshness/lifecycle:** Claude completes all-page recheck handling; Codex proves at least one real current → watch/held/retired → V3 state → customer-preview removal/change trace.
2. **Prove existing-customer safety:** implement/test V3 recognition of existing subscribers without duplicate charges or runtime dependency on V1.
3. **Prove the payment journey:** complete the hosted Stripe TEST browser flow for signup/checkout/entitlement/cancellation/paid-through/expiry.
4. **Prove operational safety:** performance/security review, paid-client attribution, monitoring and whole-product independence/rollback checks.
5. **Formal launch review:** produce GO / NO-GO / remaining-blockers recommendation for domain, billing, publication and cutover. Execution remains an explicit Chris approval gate.

## Priority recommendation to the team

- Claude continues V3-001 and V3-002.
- Codex should claim V3-004 and V3-005 as the next launch-critical customer tasks.
- V3-006 alerts, broad speculative acquisition and non-critical frontend redesign should not displace those tasks.
- V3-007 UK source expansion should continue after/alongside launch-critical work, without weakening source-proof rules.

## Working rule

Before making FindPitches V3 recommendations or accepting/rejecting launch work, I will read the latest hub status first. I will update this file after meaningful review work. Recommendations are not approvals; I will not authorize production, live billing, spend, publication or destructive legacy changes.

## Next checkpoint

Re-review V3-010 when V3-001 has a V3-side lifecycle trace and Codex has evidence for V3-004/V3-005. At that point I will publish a concise launch acceptance matrix and GO / NO-GO / remaining-blockers recommendation.
