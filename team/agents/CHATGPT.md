# ChatGPT status

**State:** ACTIVE / V3-010 CLAIMED. **Author:** ChatGPT. **Updated:** 2026-10-11T15:22:00+01:00. **Claimed task:** V3-010.

I treat the shared V3 hub on `findpitches-v3/greenfield` as the cross-agent source of truth. My scope is commercial launch acceptance, public cutover/rollback planning, billing-gate separation and reconciliation of Claude/Codex evidence. This status does not authorize launch action.

## Current V3-010 position

Chris has asked the team to assess a **same-day public FindPitches launch with working subscriptions for new FindPitches customers**. PitchList is a separate live product and is not being replaced or used as the FindPitches rollback destination.

I have updated `docs/findpitches-v3-launch-readiness-2026-10-10.md` to reflect that corrected model and the new target. The review now separates:

1. public FindPitches exposure;
2. new-customer FindPitches LIVE Stripe billing;
3. legacy PitchList subscriber migration as a later separate gate;
4. paid acquisition as a later commercial gate.

## Evidence folded in

- V3-004 remains DONE for synthetic recognition/association safeguards.
- V3-005 remains DONE with the genuine hosted Stripe TEST journey 22/22.
- V3-008 remains DONE with bounded API 39/39 and browser 30/30 acceptance.
- Codex's 2026-10-11 checkpoint narrows V3-001 to **Nashville only**. Pop Up Shops and From the Ground now have audited append-only resolutions; Nashville remains withheld pending old-2026/survivor-2027 edition/source custody.
- Codex's first V3-011 L1/L2 international increment is complete with zero new READY; AU LocalStalls is the current highest-yield conversion lever.
- Catalogue profiling confirms a release concern rather than a demonstrated correctness failure: operator snapshots roughly 3.244-4.762s, D1 execution 816-891ms, repeated inventory/proof reads dominant.

## Same-day launch review drafted

The launch-readiness document now contains a provisional smallest safe sequence:

- collect agent readiness reports;
- freeze the release candidate and baseline;
- prove new FindPitches LIVE billing is isolated from legacy PitchList migration;
- verify exact LIVE product/price/webhook/Checkout/Portal/entitlement configuration without charging first;
- record exact public hostname/access/Worker/API/indexing changes and reversals;
- run frozen preflight;
- obtain Chris's explicit approval separately for public exposure and LIVE new-customer billing;
- expose FindPitches publicly, smoke test, then enable LIVE billing and run the smallest approved production proof;
- observe a bounded acceptance window and reverse FindPitches-only changes if a stop condition occurs.

Rollback is now correctly FindPitches-only: disable new LIVE Checkout if relevant, restore the previous FindPitches private/route/indexing state, preserve V3 evidence and verify PitchList remains untouched.

## Current recommendation

**Public FindPitches + new-customer subscriptions today: CONDITIONAL-GO candidate, not executable yet.** I am waiting for:

- Codex's same-day readiness report, especially LIVE Stripe isolation/config/proof and public-runtime changes;
- Claude's producer readiness report and exact Nashville custody position;
- confirmation Nashville can remain safely withheld;
- exact production hostname/route/access/indexing change set and reversal;
- explicit Chris approval.

Legacy PitchList migration remains separate and is not assumed necessary for today's launch. Alerts, paid acquisition, UKCraftFairs Option B and V3-011 supply growth remain non-launch work unless Chris reprioritises them.

## Next action

Reconcile the Claude/Codex readiness reports when they land and issue the concise V3-010 GO / CONDITIONAL-GO / NO-GO recommendation. Do not execute any public routing, LIVE Stripe, publication, customer message or migration action without Chris explicitly approving that exact step.
