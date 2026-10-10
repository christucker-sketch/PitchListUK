# FindPitches V3 — current execution orders

Updated: 2026-10-10T19:10:00+01:00
Authority: Chris requested the team tasks be refreshed after the targeted V3-001 retry cycle. These orders supersede the 18:19 execution order where progress has overtaken it. They do not authorize production cutover, live billing, paid acquisition, customer publication, destructive V1/V2 changes, real subscriber migration, unapproved outbound messages, UKCraftFairs Option B, or protected/live branch merges.

## Current position

- V3-004 remains DONE for synthetic implementation/acceptance scope. Real subscriber migration remains separately gated.
- V3-005 remains DONE with the genuine hosted Stripe TEST journey complete 22/22.
- V3-001 is now in final verification rather than broad producer debugging.
- Of the six targeted lifecycle conflicts from the Pi retry work:
  - three were genuinely refreshed with newer producer/source evidence;
  - one is now correctly reclassified as not relevant/past event and is no longer produced under the original id;
  - one is still OPEN_NOW but now exists under a different producer/platform identity;
  - one original id has been merged into another identity.
- The latter three are therefore lifecycle/identity-resolution cases, not failed URL retries. Do not keep retrying obsolete ids merely to make the queue disappear.
- V3-002 UKCraftFairs remains outside the launch-critical path and stays off-by-default.
- V3-010 launch-readiness review is active now.

## Claude — finish producer-side V3-001 evidence

### V3-001 — immediate priority
1. Publish the final producer-side evidence for all six targeted items.
2. For the three genuinely refreshed items, retain the original request token/requested-at value, producer record id, V3 entity id, source URL, previous source timestamp, new source/fetched timestamp, resulting producer state and acknowledgement outcome.
3. For the three non-refresh cases, document the exact producer-side resolution instead of retrying obsolete ids:
   - past/not-relevant item: show why the original record correctly disappears from current production;
   - replacement-id item: show old id -> current producer/platform id relationship and current OPEN_NOW state;
   - merged item: show old id -> surviving merged identity relationship.
4. Include the all-page handoff totals already captured and confirm the runner examined every returned request/page without silently dropping deferred/no-route work.
5. Retain one clean end-to-end lifecycle trace from producer state change through feed, V3 receipt, existing identity, selected V3 state, acknowledgement and correct preview behaviour.
6. Hand the final six-item evidence set to Codex for independent ledger/identity verification.
7. Do not mark V3-001 DONE until Codex confirms both the three fresh receipts and the three lifecycle/identity resolutions on the V3 side.
8. If Codex verifies all six cleanly, close V3-001. If one item remains wrong, publish that exact item as the blocker; do not reopen the whole lifecycle design.

### V3-002 — after V3-001
1. Keep UKCraftFairs Option B OFF and unwired.
2. After V3-001 closes, produce a concise recommendation on Option B: likely customer-visible inventory gain, operational cost/risk and whether it is worth implementing.
3. Preserve D-012: enquiry-only listings are acceptable only with a verified, customer-usable contact/application route. No READY-rule weakening.

## Codex — final independent V3-001 verification, then launch support

### Supporting V3-001 — first priority
1. Verify the three genuinely fresh retries in the V3 ledger using exact producer-record/entity/request-token linkage.
2. Confirm newer evidence advances only according to existing source-clock/conflict rules and that no stale fact was force-selected.
3. Verify the three producer identity/lifecycle cases:
   - obsolete past/not-relevant id resolves to the correct withdrawn/closed/non-customer-visible outcome;
   - replacement producer/platform id maps to the correct continuing opportunity without duplicate customer-visible identity;
   - merged id resolves to the surviving canonical V3 identity without duplication or leakage.
4. Confirm none of the six produces an incorrect customer snapshot result.
5. Publish one final V3-001 cloud checkpoint covering all six outcomes and the retained end-to-end lifecycle trace.
6. If clean, explicitly state that V3-001 has sufficient cloud-side evidence to close. Do not require pointless re-fetches of ids the producer legitimately no longer emits.

### Existing-subscriber launch support
1. Keep V3-004 and V3-005 closed unless regression evidence appears.
2. Finish the read-only real-subscriber migration-readiness inventory: canonical owner coverage, Stripe mode/product/price/period-end gaps, exceptions and rollback handling.
3. Do not import, alter, charge, email or otherwise touch real subscribers.
4. Give ChatGPT a concise migration gate: exactly what must be verified before any real subscriber continuity/migration approval.

### V3-008 — next bounded engineering work
1. After the V3-001 cloud checkpoint is published, claim V3-008 if still unclaimed.
2. Measure the private preview at the real origin: latency, sign-in, search, geography/facets, Pro gating, source-link redaction and obvious browser/security regressions.
3. Keep it read-only and bounded. No publication, production routing or custom-domain cutover.

## ChatGPT — V3-010 launch-readiness review

1. Continue the V3-010 review now using completed V3-004/V3-005 evidence and the latest V3-001 producer outcomes.
2. Update the launch acceptance matrix around: lifecycle integrity, identity continuity, customer continuity, duplicate-charge prevention, billing journey, domain/routing, publication safety, rollback, monitoring, V1 protection and subscriber migration readiness.
3. Treat the three non-refresh lifecycle items correctly as identity/state transitions rather than failed retries when assessing V3-001.
4. Draft the concrete controlled-cutover sequence and rollback sequence, but do not execute either.
5. Keep the three approval gates separate:
   - controlled V3 launch;
   - real-subscriber migration/live billing;
   - paid acquisition.
6. Once Codex publishes the final V3-001 cloud checkpoint and the migration-readiness gaps are quantified, issue one concise GO / CONDITIONAL-GO / NO-GO recommendation with exact remaining blockers and operator approvals required.

## Priority order from here

1. Claude: publish the final six-item producer evidence and lifecycle trace.
2. Codex: verify all six on the V3 side, including the three identity/lifecycle resolutions, and publish the final V3-001 cloud checkpoint.
3. ChatGPT: continue V3-010 launch review in parallel and fold in the final V3-001 checkpoint when it lands.
4. Codex: finish the read-only real-subscriber migration-readiness inventory, then claim/run bounded V3-008 checks if still unclaimed.
5. Claude: once V3-001 is closed, return to V3-002 and give the UKCraftFairs Option B recommendation.

## Standing gates

Do not restart paid acquisition, enable live billing, migrate real subscribers, publish V3, cut over custom domains, alter live V1, delete legacy infrastructure, send unapproved customer messages, enable UKCraftFairs Option B, or merge to protected/live branches until Chris explicitly authorizes that exact gate.
