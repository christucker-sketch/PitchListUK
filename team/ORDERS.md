# FindPitches V3 — current execution orders

Updated: 2026-10-10T18:19:00+01:00
Authority: Chris requested the next team actions be issued to the shared hub. These orders supersede the 14:38 execution order where progress has overtaken it. They do not authorize production cutover, live billing, paid acquisition, customer publication, destructive V1/V2 changes, real subscriber migration, unapproved outbound messages, or protected/live branch merges.

## Current position

- V3-004 is DONE for synthetic implementation/acceptance scope. Subscriber recognition, duplicate-charge/trial prevention, ownership matching and rollback design are evidenced; real subscriber continuity/migration remains gated.
- V3-005 is DONE. The genuine hosted Stripe TEST journey passed 22/22 through native sign-in, hosted Checkout, trial, active Pro, hosted portal cancellation, paid-through access and ended/free redaction.
- V3-001 is the remaining launch-critical engineering proof. The all-page Pi handoff is working; the six targeted conflict records are queued for genuinely fresh refetch on the next Pi run.
- V3-002 UKCraftFairs remains non-critical to launch and stays off-by-default while launch-critical proof is closed.
- V3-010 can now move into active launch-readiness review rather than waiting on customer/payment engineering.

## Claude — close V3-001 on the next Pi run

### V3-001 — immediate priority
1. Keep V3-001 as the immediate producer task.
2. On the next Pi cycle, execute the targeted genuine refetches for the six published conflict records using the existing original request tokens.
3. For each of the six, retain: producer record ID, V3 entity ID, request token/requested-at value, source URL, previous source timestamp, new fetched/source timestamp, resulting producer state and acknowledgement outcome.
4. Do not force a state transition if the source has not genuinely changed; an unchanged-but-newly-fetched result is valid evidence if accurately recorded.
5. Include the latest full-handoff totals and show that all returned pages/requests were examined, including queued/deferred/fresh/no-route outcomes.
6. Retain one clean end-to-end lifecycle trace proving producer state change -> feed -> V3 receipt -> existing identity -> selected V3 state -> acknowledgement -> correct customer-preview behaviour.
7. Hand the exact six results plus the retained lifecycle trace to Codex for independent V3-ledger verification.
8. If Codex verifies the six and the lifecycle trace cleanly, mark V3-001 DONE with evidence links. If any item fails, publish the exact single-record defect and keep the rest closed; do not reopen the whole lifecycle design.

### V3-002 — after V3-001
1. Keep UKCraftFairs Option B OFF and unwired until V3-001 closes.
2. Once V3-001 is complete, produce a concise recommendation only: whether Option B is worth implementing, expected customer-visible inventory gain, and any operational downside.
3. Preserve D-012: enquiry-only inventory is acceptable only where there is a customer-usable verified contact/application route. Do not weaken READY/source-proof rules.

## Codex — verify V3-001, then support launch-readiness

### Supporting V3-001 — first priority
1. Watch for Claude's next six refetch results.
2. Verify exact producer-record/entity/request-token linkage in the V3 ledger for all six.
3. Confirm newer evidence is accepted only when the source clock/evidence is genuinely newer or otherwise valid under the existing conflict rules.
4. Confirm no held/closed/retired lifecycle record leaks into the customer snapshot where policy requires withholding.
5. Publish one final cloud checkpoint for V3-001. If clean, explicitly state that the cloud-side closure evidence is sufficient for Claude to mark V3-001 DONE.

### Existing-subscriber launch support
1. Keep V3-004 and V3-005 closed; do not reopen them unless regression evidence appears.
2. Produce the shortest safe real-subscriber migration-readiness inventory from the read-only UK registry: canonical owner coverage, Stripe mode/product/price/period-end gaps, exception cases and rollback handling.
3. Do not import, alter or contact any real subscriber. This is read-only launch preparation only.
4. Provide ChatGPT with a concise list of what must be true before any future live subscriber migration is approved.

### Optional next engineering claim
1. After V3-001 cloud verification is published, claim V3-008 if unclaimed and measure the private preview's real-origin customer behaviour: latency, sign-in, search, geography/facets, Pro gating, source-link redaction and obvious security/browser regressions.
2. Keep this bounded and read-only. Do not publish V3 or alter production routing.

## ChatGPT — V3-010 launch-readiness review starts now

1. Begin the V3-010 review immediately using the completed V3-004 and V3-005 evidence; do not wait idle for V3-001.
2. Build the launch acceptance matrix around these gates: lifecycle integrity, customer continuity, duplicate-charge prevention, billing journey, domain/routing, publication safety, rollback, monitoring, V1 protection and subscriber migration readiness.
3. Treat V3-001 as the final launch-critical engineering evidence still pending. Incorporate Claude/Codex proof as soon as the six refetches land.
4. Distinguish clearly between:
   - ready for controlled V3 launch;
   - ready for real-subscriber migration;
   - ready for paid acquisition;
   These are separate gates and must not be collapsed into one approval.
5. Draft the concrete cutover and rollback sequence now, but do not execute it.
6. Once V3-001 is closed and the migration-readiness gaps are quantified, publish one concise GO / NO-GO / CONDITIONAL-GO recommendation with exact remaining blockers and required operator approvals.

## Priority order from here

1. Claude: next Pi run — complete the six genuine conflict refetches and lifecycle proof.
2. Codex: independently verify those six and publish the final V3-001 cloud checkpoint.
3. ChatGPT: run V3-010 launch-readiness review in parallel using completed V3-004/V3-005 evidence.
4. Codex: quantify real-subscriber migration gaps and, after V3-001 verification, claim/run bounded V3-008 real-origin checks if still unclaimed.
5. Claude: after V3-001 closure, return to V3-002 and make a commercial/technical recommendation on UKCraftFairs Option B.

## Standing gates

Do not restart paid acquisition, enable live billing, migrate real subscribers, publish V3, cut over custom domains, alter live V1, delete legacy infrastructure, send unapproved customer messages, enable UKCraftFairs Option B, or merge to protected/live branches until Chris explicitly authorizes that exact gate.
