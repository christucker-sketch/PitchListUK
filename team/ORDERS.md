# FindPitches V3 — current execution orders

Updated: 2026-10-10T12:40:00+01:00
Authority: Chris requested updated orders be issued to the shared hub. These orders do not authorize production cutover, live billing, paid acquisition, customer publication, destructive V1/V2 changes, or unapproved outbound messages.

## Claude — V3-001 and V3-002

### V3-001 — finish the producer lifecycle proof
1. Keep ownership of V3-001.
2. Record the first complete discovery/recheck cycle on the newly installed all-page cursor runner and prove every returned page/request was examined, including the `deferred` count.
3. Obtain genuinely fresh refetches for the six equal-source-clock conflicts identified by Codex; do not force or overwrite them merely to clear the queue.
4. Retain one clean end-to-end example proving: current -> watch/held/retired/closed -> lifecycle feed -> V3 receipt -> existing identity -> acknowledgement -> customer preview withheld/updated as expected.
5. Coordinate with Codex for the cloud-side ledger/state evidence. Do not close V3-001 until both producer execution and V3-side state/visibility are evidenced.
6. Update the hub with the evidence and exact remaining blocker, if any.

### V3-002 — UKCraftFairs
1. Evidence note is published; do not weaken READY rules.
2. Hold implementation pending the product/source-proof decision.
3. Prepare the cleanest implementation path for producer-supplied source documents to be verified by V3 if that option is approved, while preserving fetched-at time, URL, content hash and retained source HTML/provenance.
4. Keep enquiry-only inventory separate from application-ready inventory unless/until an explicit product policy says otherwise.

## Codex — V3-004 and V3-005, plus V3-001 cloud support

### V3-004 — existing-subscriber recognition
1. Continue as highest-priority customer/commercial engineering task.
2. Implement the TEST-only operator-reviewed association ledger and canonical recognition adapter already designed.
3. Prove: correct ownership match, wrong-owner rejection, idempotent/repeated recognition, concurrent/replay safety, duplicate Checkout prevention, active entitlement, cancellation with paid-through access, and expiry.
4. Use synthetic TEST identities and read-only legacy comparison only. No live subscriber import, no duplicate charge risk, and no V1/V2 runtime dependency.
5. Publish sanitized evidence and update the hub when the matrix is complete.

### V3-005 — hosted Stripe TEST journey
1. Resolve browser trust at the actual private preview origin. Diagnose the environment/proxy certificate chain properly; do not use an insecure certificate bypass as launch evidence.
2. Once trusted navigation works, run the real hosted TEST journey end to end: signup/sign-in -> hosted Checkout -> return -> entitlement -> portal/cancellation -> paid-through -> expiry.
3. API-created subscriptions, loopback tests or mocked browser flows do not count as completion.
4. If the browser-trust problem is environmental rather than product code, document the exact cause and a reproducible trusted test route rather than changing production security to accommodate the test environment.

### Supporting V3-001
1. Continue to verify Claude's lifecycle deliveries from the V3 ledger.
2. For the six equal-clock conflicts, issue/retain the exact recheck requests needed for genuinely newer source evidence and confirm the resulting state when the producer returns it.
3. Confirm the final retained lifecycle trace stays out of the customer snapshot where policy requires.

## ChatGPT — V3-010

1. Keep V3-010 claimed.
2. Do not recommend launch until V3-001, V3-004 and V3-005 have evidence strong enough for review.
3. In parallel, review the UKCraftFairs proof-policy choice and keep it separate from launch-critical payment/lifecycle work.
4. When the evidence is ready, issue one concise commercial launch assessment: GO / NO-GO / remaining blockers, covering domain, billing, publication, rollback, customer continuity and V1 protection.

## Priority order

1. Complete V3-001 lifecycle proof.
2. Complete V3-004 existing-subscriber safety.
3. Unblock and complete V3-005 hosted Stripe TEST journey.
4. Decide UKCraftFairs proof policy and continue V3-002 accordingly.
5. Run V3-010 launch-readiness review.

Do not restart paid acquisition, enable live billing, publish V3, cut over domains, or change live V1 until Chris explicitly authorizes that exact gate.
