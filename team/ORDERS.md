# FindPitches V3 — current execution orders

Updated: 2026-10-11 after the team readiness reports.
Authority: **D-014 / Chris: “ok lets do it, or we'll be tinkering forever more”.** The review phase is complete. The team is authorized to execute the minimum safe controlled launch of **public FindPitches with new-customer LIVE subscriptions**.

PitchList remains a separate protected product and must remain live and untouched throughout.

## Launch objective

Today’s target is a real production FindPitches service with public browsing/search, real sign-in/account creation, existing Free/Pro gating, a working LIVE Stripe subscription path for brand-new FindPitches customers, truthful pricing/feature copy, normal transactional auth/billing messages, and eligible public pages becoming indexable under the existing SEO rules.

Still out of scope: legacy PitchList subscriber migration, paid acquisition, alert campaigns/delivery, UKCraftFairs Option B, destructive V1/V2 changes, infrastructure deletion and unrelated protected/live merges.

## Current evidence

- V3-004, V3-005 and V3-008 remain complete.
- Codex reports the current runtime is **NO-GO as-is** because public access, LIVE billing and LIVE customer storage are deliberately blocked in code/schema. This is now an implementation task.
- Claude reports the producer/Pi side is **CONDITIONAL-GO**. Nashville can remain withheld and does not block the rest of the catalogue.
- Nashville old-2026/survivor-2027 must remain excluded from customer-visible inventory until its separate custody question is resolved.
- Latest Codex READY recount before launch work: 1,811 total at 15:40:23 — GB127 / US1678 / AU2 / NZ4 / CA0 / IE0.
- Catalogue latency remains a release concern, not a launch stop condition unless the production smoke shows persistent user-visible failure.
- FindPitches apex/www currently sit on the shared `pitchlistuk.pages.dev` Pages project that also serves `pitchlist.uk`. Do not mutate that shared Pages project in a way that risks PitchList. Prefer a FindPitches-only Worker/custom-route design with an exact reversal.

## Codex — P0 launch implementation owner

Pause routine catalogue/LocalStalls optimisation until the production customer path is stable.

### A. Production customer runtime

1. Add an explicit production/public customer mode instead of weakening `restricted_shadow_preview`.
2. Keep the existing shadow/TEST runtime intact for regression testing.
3. Use an isolated production customer database/schema that supports LIVE Stripe rows and rejects TEST objects. Do not destructively convert the preview TEST database.
4. Preserve ownership, single-subscription controls, Checkout reservation/idempotency, webhook receipt dedupe, paid-through cancellation semantics and Free redaction.
5. Disable synthetic `/preview/*` provisioning/recognition paths in public mode.
6. Keep browser access same-origin and retain the private service binding to the evidence/catalogue backend.
7. Preserve Nashville/held/expired/source-proof filters on every customer read path.

### B. New-customer LIVE Stripe

1. Reuse the existing Stripe account with FindPitches-owned LIVE product/price/webhook/portal configuration. Do not modify PitchList customer/subscription ownership or webhook behaviour.
2. Verify exact LIVE account, product, price, currency, interval, trial policy and payable market entitlement before exposing Checkout.
3. Existing TEST configuration is £4.99/month with a 7-day first trial. Do not silently promote TEST IDs or market scope into LIVE. If no authoritative LIVE product/price/market policy exists, continue all other launch work and report that one exact operator decision rather than reopening architecture.
4. Keep TEST/LIVE IDs, keys, databases, webhook secrets and idempotency namespaces strictly separated.
5. LIVE confirmation/entitlement must verify canonical owner, customer, subscription, mode, product, price and market access. Session success alone cannot grant Pro.
6. Configure a FindPitches-specific LIVE webhook endpoint with signature validation, durable event dedupe/replay handling and canonical provider rereads. Ignore unowned PitchList events.
7. Configure hosted Billing Portal for FindPitches customers and preserve paid-through cancellation access during rollback.
8. Correct customer-facing claims before subscriptions are exposed: alerts remain unavailable/coming later until V3-006 is separately approved.

### C. Public FindPitches runtime / routing

1. Make anonymous public browsing/search work without the invitation gate.
2. Keep mailbox verification/sign-in, secure host cookies, CSRF/revocation and bounded auth/read controls.
3. Implement public SEO mode: remove blanket private `noindex` only from eligible public content; keep account/auth/API/billing/private/empty surfaces noindex where appropriate.
4. Prepare an exact FindPitches-only Cloudflare routing change for apex/www. Preserve the shared Pages project and `pitchlist.uk` untouched.
5. Record prior DNS/route state and exact reverse operation before applying production routing.
6. Do not enable the unused legacy publication pipeline just to expose the V3 customer catalogue; use the existing proof-filtered customer read model unless evidence proves otherwise.

### D. Required preflight before public exposure

Publish a launch checkpoint proving:

- full/focused V3 tests green;
- production-mode customer/auth/billing tests including wrong-mode/wrong-owner/wrong-product/wrong-price/wrong-market cases;
- Checkout concurrency/retry/idempotency tests;
- webhook replay/out-of-order/signature/failure tests;
- cancellation/paid-through/expiry/Free-redaction tests;
- Nashville remains 0 customer-visible;
- no PitchList routing/data/provider changes;
- frozen READY/customer/queue/producer baseline;
- exact FindPitches route + rollback object;
- exact LIVE Stripe product/price/market configuration, or the single unresolved operator decision if provider setup genuinely requires Chris.

### E. Controlled production sequence

D-014 authorizes the launch once the preflight above is recorded.

1. Freeze release/deployment IDs and baseline.
2. Deploy the production customer Worker/database/bindings while still safely gated.
3. Prove production health without arbitrary customer activity.
4. Apply the FindPitches-only public route/access change and verify PitchList separately immediately afterwards.
5. Smoke public homepage/search/auth/redaction/Pro gating/security/SEO from the real hostname.
6. Expose LIVE Checkout only after exact LIVE provider configuration is verified.
7. If a final operator-only Stripe step is required, stop at that exact step and give Chris the shortest possible instruction. Do not substitute synthetic provider objects for the real hosted customer journey.
8. Verify webhook → canonical subscription → entitlement → Portal/cancellation behaviour using the agreed controlled production proof.
9. Monitor the launch window and report GO or rollback.

### F. Rollback

Rollback FindPitches only. Do not route users to PitchList as a substitute product.

- close new Checkout first if billing safety is uncertain;
- reverse the FindPitches-only route/access/index change to the recorded safe state or serve a FindPitches-only unavailable page;
- keep LIVE webhook processing and account/Portal/cancellation access working for any LIVE customer objects already created;
- preserve LIVE customer mappings, subscriptions, receipts and evidence;
- do not convert LIVE customer storage back to TEST semantics;
- verify PitchList remained healthy throughout.

## Claude — P0 producer launch support

1. Resolve C1/C2/C3 from the producer readiness report with Codex:
   - C1: confirm the public customer runtime reads the existing immutable V3 evidence path without requiring the Pi to deliver to a new uncontrolled environment;
   - C2: if a new ingest-only production token is required, prepare the coordinated Pi transition instructions without exposing/committing the token;
   - C3: provide producer/source-age thresholds for launch monitoring and confirm current delivery/freshness immediately before cutover.
2. Nashville remains withheld. Do not delay the whole launch to force a cross-edition decision.
3. Do not install unrelated international/LocalStalls kits during the cutover window unless needed for safety.
4. Confirm off-site backup status and current Pi health/freshness immediately before cutover.
5. After launch stabilises, resume V3-011 and V3-002 work.

## ChatGPT — V3-010 launch coordinator

1. Treat D-014 as authorization to proceed with this controlled launch scope.
2. Reconcile Codex/Claude checkpoints and call out only genuine stop conditions, not polish.
3. Move V3-010 from review mode to execution/acceptance mode.
4. Keep legacy PitchList migration separate from new FindPitches billing.
5. Keep paid acquisition, alerts, UKCF Option B and legacy migration closed.
6. When Codex reaches a genuine operator-only dependency, surface the exact minimal action to Chris rather than reopening architecture discussion.
7. Once public-origin and LIVE subscription proof pass, publish the final launch acceptance checkpoint and return the team to supply/optimisation work.

## Launch stop conditions

Stop/rollback for systemic public auth failure; incorrect Pro grant or Free source-link leakage; wrong market entitlement or wrong Stripe product/price; duplicate subscription behaviour; webhook ownership/signature failure that leaves entitlement unsafe; Nashville/held/closed/expired leakage; duplicate customer-visible identity; sustained public 5xx/timeouts; unexplained material inventory divergence; any impact on `pitchlist.uk`; or loss of account/Portal/cancellation access for LIVE FindPitches customers.

## Deferred until launch stabilises

Legacy PitchList subscriber migration; paid acquisition/V3-009; alert delivery/V3-006; UKCraftFairs Option B; routine LocalStalls optimisation; V3-012 Europe (France, Germany, Netherlands, Spain).

## Standing principle

We are launching a new FindPitches product, not replacing PitchList. Move decisively, but preserve the isolation and evidence rules that got V3 this far.
