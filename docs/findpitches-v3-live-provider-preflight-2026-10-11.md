# FindPitches V3 LIVE provider preflight

Codex, 11 October 2026. This supersedes the missing-Stripe-file blocker in the [16:47 checkpoint](findpitches-v3-production-checkpoint-2026-10-11.md). Measurements have their own timestamps in the [machine report](../operations/findpitches-v3/reports/customer-live-provider-checkpoint-2026-10-11.json). Authority: D-014/D-016 and [launch orders](../team/ORDERS.md).

**Completed preflight: LIVE Stripe and native SMTP2GO are verified on the isolated production Worker. Authorized public routing/browsing is next, with Checkout closed until real-origin smoke passes.** No further launch/pricing approval is needed. No real LIVE customer journey has been attempted.

## Stripe verification and deployment

The actual attached `findpitches-v3-production.env` was downloaded privately, parsed as data and retained with permissions 0600. It contains the restricted LIVE Stripe key only. No credential value was printed or committed.

Canonical reads verified Hal's existing `FindPitches Pro` product `prod_VQF2oqHreWwhOj`, its global-entitlement metadata, GBP499/USD699/EUR599 monthly price variants and dedicated non-default Portal `bpc_1UPOZ7EIdSfbjtdoUSK1A5h9`. Cancellation is at period end; payment-method updates and invoice history are available; customer/subscription switching is disabled. These existing objects were adopted without replacement or modification.

One dedicated LIVE webhook was created: `we_1UPPE8EIdSfbjtdo0FcfjvyT`, at `https://findpitches-v3-customer-production.ctucker.workers.dev/api/v3/stripe/webhook`. Its URL, enabled status, exact six lifecycle events and V3 setup metadata were independently reread. A replay performed six provider reads and **zero further provider writes**. The LIVE key and signing secret were privately bound to production; no customer, Checkout Session, subscription or charge was created.

The restricted key denies `/account` with403. Exact approved globally unique LIVE object IDs were independently verified without a Connect header, alternate account or TEST fallback; the account ID `acct_1TTp8UEIdSfbjtdo` remains Chris/Hal's explicit custody statement. No canonical `/account` proof is claimed.

Final gated deployment at **17:11:26 London /16:11:26UTC**:

- Worker/D1: `findpitches-v3-customer-production`, separate from the TEST preview and source evidence database.
- Deployment: `7afc8edf-0b92-48f4-bc0b-e57afb8bc333`.
- Active version after native secret binding: `eea9ed01-a1e9-4c65-9514-360ff6140bb2`.
- Public access false; account recovery false; Checkout disabled; no domain routes attached.
- Existing immutable shadow evidence service remains the catalogue source. The Pi needs no new delivery environment.

The new operator-only `/ops/billing/verify` performs canonical reads using the **actual deployed Worker credential**. At17:12:27 London it returned200 and verified product, all three prices, global entitlement and safe Portal configuration. Unauthorized access returned403. An unsigned webhook request returned403 without inserting a receipt. Signature rejection/configuration reads do not substitute for delivery of a genuine signed customer lifecycle event.

## Release and preservation evidence

- Full V3 suite: **259/259**, zero failures/skips; production-focused checks17/17; frontend3/3, independence and V3 boundary checks passed.
- Native eligible inventory at17:12:27: **1,811** — GB127, US1678, AU2, NZ4, CA0, IE0. Nashville0 eligible.
- Production customers, Stripe mappings, subscriptions, Checkout attempts and webhook receipts: **all0**.
- Preservation at17:13:34: **15,811 receipts,108,819 source facts,7,077 retained identities**; **zero destructive mutations or identity changes**. Shadow customer projection/publication rows0; old publication API denied; paid queries0/bulk disabled; protected Pages deployment and V2 schedules unchanged.
- Read-only routing refresh at17:13:48: prior FindPitches Worker routes remain empty. The two planned routes are `findpitches.com/*` and `www.findpitches.com/*` to the owned production Worker. No DNS/shared Pages change was made. Protected Pages deployment remains `7f359dff-0702-4acb-aa69-2f28859c91ce`.
- Protected `pitchlist.uk` homepage returned200 with PitchList identity at17:14:22. This is homepage availability proof, not an authenticated legacy customer/API journey.
- Queue at17:10:40: due0/leased0/dead0/future9278. Paid queries0; programme manually paused; latent25/day cap and global1000/day remain.
- Pi authenticated transport at17:04:13: healthy cadence, roughly15.2-minute intervals. Latest source check remains12:39:57, receipt12:57:43 London; existing four-hour aggregate warning true.977 pending rechecks, zero fresh-ack-eligible. No timestamp/ack/expiry extension was made; Claude should confirm the next discovery/export. Individual proof expiry continues to govern eligibility.

## Native mail verified; controlled exposure is next

Chris added the existing raw SMTP2GO key directly to **`findpitches-v3-customer-production`**, as `V3_EMAIL_API_KEY` Secret. At **17:19:34 London**, the native provider/domain probe returned200: credential valid, sender `hello@findpitches.com`, domain verified, zero emails sent. No new sender/account/domain was created. Cloudflare deployment/version after that native secret update: `9456746c-d966-4cd5-be3c-6cb330428728` / `7a955e61-aa19-41a5-a677-5bb9a63510be`. Earlier17:12 missing-key observations in this document/report are retained historical measurements.

Fresh native canonical billing/mail/catalogue checks passed again before exposure. The preflight now has no credential blocker. [Controlled launch tool](../operations/findpitches-v3/launch-customer-public.mjs) freezes the exact FindPitches zone/route/DNS/Pages baseline, verifies fresh native mail/billing/proof and preservation/spend/queue evidence, and opens browsing separately from Checkout. Unexpected paths/foreign scripts, stale evidence or failed safety checks stop it. On failure it invokes the customer-safe pause. Existing bindings, including the manually entered raw mail key, are inherited without exporting their values. Three launch refusal/scope tests plus two pause tests passed.

Next: apply only FindPitches apex/www routes/public browsing, immediately check protected PitchList, pass [real-origin smoke](../operations/findpitches-v3/smoke-customer-public.mjs) plus browser checks, then enable Checkout. Genuine hosted LIVE customer/card/webhook/global entitlement/Portal/cancellation acceptance remains pending; do not manufacture provider objects to replace it.

Claude's `cdd80693` identifies a producer export regression and supplies a hotfix: authenticated delivery is healthy but replays the last export. His producer preflight explicitly says this degrades freshness and is not a customer-correctness blocker. The hotfix installation/successful export remains Claude/Chris's operational follow-up. Nashville stays withheld; no lifecycle/edition repair or unrelated Pi kit installation is part of this launch.

## Cancellation-safe pause

Added [pause command](../operations/findpitches-v3/pause-customer-production.mjs): first disable new Checkout, then close catalogue/indexability with account recovery enabled. It verifies the isolated LIVE runtime/schema and preserves every unrelated binding/settings value by version inheritance. **Routes, LIVE database, credentials, webhook, authentication and Portal/cancellation remain intact.** It cannot reopen Checkout or substitute TEST storage.

```sh
node operations/findpitches-v3/pause-customer-production.mjs --pause \
  --credentials /tmp/findpitches-codex-cloudflare.env \
  --production-dir /workspace/.pitchlist-cloud/v3-customer-production
```

Preservation/refusal tests passed. A native pause mutation was not executed: current deployment is already gated, and opening recovery is unnecessary before launch. Record that limit instead of claiming a performed rollback drill.

Legacy subscriber migration, paid acquisition, alert delivery, UKCraftFairs Option B, destructive legacy work and protected/live merges remain closed. No extra mail or customer/provider activity occurred in this checkpoint.
