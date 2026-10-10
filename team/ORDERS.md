# FindPitches V3 — current execution orders

Updated: 2026-10-10T14:38:00+01:00
Authority: Chris requested the next team actions be issued to the shared hub. These orders supersede the 12:40 execution order where progress has overtaken it. They do not authorize production cutover, live billing, paid acquisition, customer publication, destructive V1/V2 changes, real subscriber migration, or unapproved outbound messages.

## Current position

- V3-004 synthetic subscriber-recognition engineering has materially passed: full V3 suite 223/223, focused recognition 24/24, deployed recognition 16/16. This is strong TEST evidence, not approval to migrate real subscribers.
- V3-005 is now blocked specifically by restricted Codex-environment egress to Stripe hosted domains, not by V3 TLS, sign-in, credentials or known billing code.
- V3-001 producer paging is installed and all-page requests are visible. Cloud-side lifecycle handling is already proven for the first 119 receipts; producer-side full-cycle/refetch evidence remains open.
- V3-002 UKCraftFairs Option B is prepared off-by-default. It is not launch-critical and stays held until the product/source-proof decision.

## Claude — close V3-001 first

### V3-001 — producer lifecycle proof
1. Keep this as the immediate producer priority.
2. Capture the first complete discovery/recheck cycle using the installed all-page cursor runner. Record total requests examined, pages consumed, fresh/already-fresh/no-route/deferred outcomes, acknowledgements and any failures.
3. Execute genuine newer refetches for the six exact conflict rechecks already published by Codex. Preserve their original request tokens and return stronger source timestamps/evidence; do not force state merely to clear the queue.
4. Retain one final end-to-end lifecycle example covering producer current state -> watch/held/retired/closed -> feed -> V3 receipt -> existing identity -> V3 state -> acknowledgement -> correct customer-preview withholding/update.
5. Hand the resulting IDs/timestamps to Codex for independent V3-ledger confirmation.
6. If that evidence is clean, mark V3-001 DONE with links to both producer and cloud proof. If not, state the exact remaining defect rather than opening a new broad investigation.

### V3-002 — UKCraftFairs
1. Keep Option B code OFF and unwired while V3-001 is being closed.
2. Preserve the source-document proposal and evidence as-is; no READY-rule weakening.
3. Do not let this block lifecycle, subscriber or payment completion.
4. After launch-critical gates are closed, return with a recommendation on whether Option B is worth implementing for enquiry-only inventory and what measurable READY/customer value it would add.

## Codex — unblock payment proof and finish subscriber acceptance evidence

### V3-005 — highest immediate Codex priority
1. Apply the prepared additive restricted-egress settings needed for `checkout.stripe.com`, `billing.stripe.com` and `js.stripe.com`, preserving the existing destination restrictions.
2. Re-prove trusted navigation from a clean disposable browser profile. Do not use `ignore-certificate-errors`, global CA weakening, unrestricted egress or a loopback substitute as launch evidence.
3. Run one bounded genuine hosted Stripe TEST journey end-to-end: native signup/sign-in -> hosted Checkout -> successful return -> Pro entitlement -> portal -> cancellation -> paid-through access -> expiry/ended access.
4. Retain sanitized evidence for each state transition, including Stripe TEST object IDs where safe, V3 entitlement state and customer-facing behaviour.
5. If network settings still block hosted Stripe, publish the exact failing hostname/status and the smallest environment change still required. Do not modify production security to make the test pass.

### V3-004 — move from implementation proof to acceptance package
1. Treat the synthetic implementation matrix as a completed engineering milestone, but not real-subscriber continuity proof.
2. Produce a concise acceptance package showing how an existing subscriber will be matched to the canonical owner and entitlement without an email-only association, duplicate trial, duplicate Checkout or V1/V2 runtime dependency.
3. Define the read-only legacy comparison inputs required for a future controlled migration and the operator review/rollback path.
4. Quantify existing subscriber/product/price cases that still need coverage before any migration approval. Do not import or alter real subscribers yet.

### Supporting V3-001
1. When Claude returns the six fresh refetches and full-cycle evidence, verify exact receipt/entity/request-token linkage in the V3 ledger.
2. Confirm selected states advance only on genuinely newer evidence and that no policy-withheld lifecycle record leaks into the customer snapshot.
3. Publish the final cloud checkpoint needed for V3-001 closure.

## ChatGPT — V3-010 launch-readiness work

1. Review the completed V3-004 synthetic recognition evidence now and convert it into explicit launch acceptance criteria for customer continuity, duplicate-charge prevention and rollback.
2. Keep V3-010 open until V3-001 and V3-005 are evidenced and Codex has supplied the existing-subscriber acceptance package.
3. Treat UKCraftFairs as a separate source-expansion decision unless evidence shows it is required for launch viability.
4. Once V3-001/V3-004/V3-005 evidence is complete, issue one concise GO / NO-GO / remaining-blockers recommendation covering customer continuity, billing, domain routing, publication, rollback, V1 protection and operational monitoring.

## Priority order from here

1. Codex: remove the Stripe hosted-domain egress blocker and complete V3-005.
2. Claude: complete the first all-page producer cycle, six fresh conflict refetches and close V3-001 with Codex verification.
3. Codex: package V3-004 existing-subscriber acceptance evidence and enumerate real migration coverage still required.
4. ChatGPT: perform V3-010 launch acceptance review as soon as 1–3 are evidenced.
5. Return to V3-002/UKCraftFairs and other source-expansion work after launch-critical proof unless it becomes a genuine commercial blocker.

## Standing gates

Do not restart paid acquisition, enable live billing, migrate real subscribers, publish V3, cut over custom domains, alter live V1, delete legacy infrastructure, send unapproved customer messages, or merge to protected/live branches until Chris explicitly authorizes that exact gate.
