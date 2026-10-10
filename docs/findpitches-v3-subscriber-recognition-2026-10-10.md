# V3-004 recognition evidence and V3-005 browser checkpoint

10 October 2026, Europe/London. V3-004's synthetic TEST implementation and matrix are complete. V3-005 remains blocked on **hosted Stripe network access**, after resolving native browser certificate trust. This is private shadow work; no actual subscribers were migrated.

## Deployment and validation

The owned `findpitches-v3-customer-preview` Worker was deployed at **12:54:30 London**, version **`e13b345c-77d1-494a-943c-c355df39cca8`**, serving 100% of that private preview's traffic. Its URL is <https://findpitches-v3-customer-preview.ctucker.workers.dev>. No live domain route or production traffic changed. The source implementation is recorded in the feature-branch commit containing this report; [deployment evidence](../operations/findpitches-v3/reports/customer-recognition-deployment-2026-10-10.json) records Cloudflare custody separately.

- Full V3 suite: **223/223**, zero failed/skipped; completed **13:23:59 London**. Includes 13 new recognition tests and fresh-cache checks immediately before, at and after paid-through expiry. [Sanitized validation](../operations/findpitches-v3/reports/customer-recognition-validation-2026-10-10.json). The independent producer's subsequent source-only commits were preserved; their tests remain separately attributed to Claude.
- Focused recognition plus existing customer tests: **24/24**. Runtime boundary checks passed again after integrating the newer hub/producer commits.
- Deployed synthetic recognition: **16/16**, completed **13:02:56 London**. [Machine evidence](../operations/findpitches-v3/reports/subscriber-recognition-2026-10-10.json).
- Native Chromium HTTPS/browser checks: **5/5**, completed **13:11:01 London**. Hosted Stripe checks failed network access and do not count as completed billing. [Browser evidence](../operations/findpitches-v3/reports/browser-trust-2026-10-10.json).

Deployed SMTP2GO credential/sender validation also passed after this deployment, with **zero messages sent**. Existing mail bindings were preserved; no raw key was copied out of Cloudflare.

## Reviewed recognition implementation

An operator-only `POST /preview/subscribers/recognize` accepts a strictly validated, reviewed **synthetic_test** manifest. It binds an exact native customer, Stripe TEST customer/subscription, approved price, GB market, original vendor identity and custody hash. Only reserved example-domain accounts with a consumed native challenge qualify. It never matches or imports real subscribers automatically by email.

[`0003_test_subscriber_recognition.sql`](../operations/findpitches-v3/customer-migrations/0003_test_subscriber_recognition.sql) adds the append-only association and canonical decision ledgers. Unique ownership bindings, immutable association/mapping triggers, pending-Checkout guards and reservation triggers prevent rebinding and concurrent duplicate Checkout. Derived subscription state may advance only through the existing canonical reconciliation path; provider/native identity stays fixed.

[`customer-recognition.mjs`](../platform/findpitches-v3/customer-recognition.mjs) reads exact canonical Stripe customer/subscription ownership, including the retained legacy identity vocabulary (`pitchlist_database` / `vendor_id`). It requires the approved TEST £4.99 monthly price, one item, monthly interval and quantity one. No legacy API, cookie, KV or customer database participates in runtime recognition, and no provider metadata is rewritten.

Recognized accounts cannot start ordinary Checkout, even after cancellation/expiry. Renewal needs a separate explicit design rather than a duplicate subscription or second trial. Unrecognized active products on a native mapped customer require review instead of automatically starting another subscription. Coverage of actual legacy prices and unknown real customers remains a live-continuity gate.

| Safety/entitlement case | Evidence and outcome |
| --- | --- |
| Reviewed exact legacy-shaped TEST owner | Canonical trial and active GB access in the deployed Worker |
| Wrong vendor, email-only claim, foreign/native owner, invalid mode/price/market | Reject; local adversarial cases and deployed wrong-vendor rejection |
| Repeated/concurrent review | Same association; deployed one association, one mapping, zero Checkout attempts |
| Pending/concurrent Checkout or ownership rebound | Durable DB guards; local tests |
| Duplicate subscription/trial | Deployed Checkout rejected before and after cancellation; canonical fixture retained one subscription |
| Provider source identity/metadata | Customer/subscription metadata unchanged by recognition; zero recognition provider mutations |
| Scheduled cancellation | Deployed canonical active paid-through access, future period end and cancellation flag |
| Immediate cancellation | Deployed free access; application/source links redacted, including in the real native browser |
| Exact paid-through end, stale/future cache, payment-problem states | Local boundary tests deny access; no invented deployed expiry timestamp |
| Canonical owner changes, missing subscription, older cache write | Fail closed; preserve immutable associations and newer canonical state |
| Portal ownership | Local test uses exact canonical owner and owned TEST portal configuration; hosted portal navigation remains unproved |

The bounded fixture used one synthetic TEST customer, payment method and subscription. Setup/activation/cancellation are TEST provider writes; recognition itself only reads provider state. The report's two write calls cover the **final resumed verification invocation only**, not all earlier fixture setup calls. The fixture is now cancelled and the runner refuses to reuse a completed fixture. There were zero real charges, real customer imports, emails or Serper queries.

An overlapping webhook can write a canonical cache newer than an in-flight request clock. Such a request conservatively denies access. The deployed verifier uses at most three fresh canonical read requests to observe the settled active/paid-through state; the entitlement clock safeguards were not relaxed.

## Browser trust and the remaining hosted-payment blocker

The environment proxy uses a CA already supplied at `/usr/local/share/ca-certificates/environment-proxy-ca.crt`; Chromium's browser store initially lacked that trust. A disposable profile now trusts that existing CA with DNS constraints covering the exact native preview and Stripe domains. Its public DER SHA-256 is recorded in the machine report. System/global NSS trust, `HOME`, product TLS and browser certificate verification were not changed or bypassed.

The reusable tools are [`prepare-isolated-browser-trust.py`](../operations/findpitches-v3/prepare-isolated-browser-trust.py) and [`verify-native-browser-trust.py`](../operations/findpitches-v3/verify-native-browser-trust.py). The former checks Chromium 151's existing certificate schema and requires the browser to be closed. Its encoding follows Chromium's [CertificateMetadata definition](https://github.com/chromium/chromium/blob/main/components/server_certificate_database/server_certificate_database.proto). Only `/workspace/.pitchlist-cloud/v3-browser-trust-isolated` is accepted. Initialize this profile through Chromium's certificate manager if its certificate DB is absent; no system store is used.

With a freshly prepared **private synthetic one-use sign-in file**, the tested commands are:

```sh
python operations/findpitches-v3/prepare-isolated-browser-trust.py \
  --profile /workspace/.pitchlist-cloud/v3-browser-trust-isolated
python operations/findpitches-v3/verify-native-browser-trust.py \
  --session-file /workspace/.pitchlist-cloud/v3-customer-preview/browser-session-private.json \
  --profile /workspace/.pitchlist-cloud/v3-browser-trust-isolated \
  --report /workspace/.pitchlist-cloud/v3-customer-preview/browser-trust-report.json
```

This exercised the **actual deployed HTTPS origin**: health 200, unauthenticated homepage 401, browser-consumed sign-in challenge, Secure/HttpOnly/SameSite/Path cookie flags and ended-subscription redaction. It used no loopback relay or API-created replacement for browser sign-in. A consumed sign-in URL must not be replayed or published.

Normal proxy CONNECT requests established the current network limitation:

| Destination | CONNECT status | Browser outcome |
| --- | ---: | --- |
| Native preview | 200 | Validated HTTPS; native checks pass |
| `checkout.stripe.com` | 403 | `ERR_TUNNEL_CONNECTION_FAILED` |
| `billing.stripe.com` | 403 | `ERR_TUNNEL_CONNECTION_FAILED` |
| `js.stripe.com` | 403 | `ERR_TUNNEL_CONNECTION_FAILED` |

The saved environment configuration confirmed restricted egress allows `api.stripe.com` but omits these hosted domains. Using the onboarding skill, an additive configuration **draft** was saved for `*.stripe.com`, `*.stripe.network` and `*.stripecdn.com`, retaining all existing explicit destinations and startup requirements. Startup guidance now records the tested isolated trust route and the completed mail-send scope. The draft requires review/application in **Codex cloud-environment settings**; saving it has not changed running proxy access or completed the hosted journey. No replacement secret is needed.

After those settings are applied, retry normal proxy/browser access, then perform one bounded actual hosted TEST Checkout → return → entitlement → portal cancellation → paid-through journey. Retain temporal expiry separately if the hosted flow cannot support a TEST clock. Do not count API subscriptions as hosted completion or bypass proxy/TLS policy. A negative test of certificate DNS constraints was not established because its outside-domain probe failed network access first.

## V3-001 support and preservation

At **12:45:16 London**, the six equal-source-clock conflicts all had existing exact recheck requests. **Zero new requests**, original tokens preserved, no bulk acknowledgement or forced evidence update. [Exact IDs and request tokens](../operations/findpitches-v3/reports/lifecycle-conflict-rechecks-2026-10-10.json) let Claude target genuine source re-fetches. The preceding 119-record cloud cohort remains the separately timed [lifecycle checkpoint](findpitches-v3-lifecycle-cloud-checkpoint-2026-10-10.md). Producer all-page execution and a later fresh-source return are not claimed by this inspection.

[Preservation at 13:06:51 London](../operations/findpitches-v3/reports/customer-recognition-preservation-2026-10-10.json) compared **15,811 original receipts, 108,819 source facts and 7,077 existing identities**: zero source mutations, identity changes, customer projection rows or publication queue rows; publication API denied, paid queries today zero, bulk off. Live Pitchlist deployment and V2 schedules remain unchanged. These checks do not recount commercial inventory.

Claude's newer producer/document proposal and **D-012 contact-organiser policy** were read and preserved. That policy requires a verified usable HTTPS contact route and accurate enquiry/login labelling; it does not turn unverified producer records into READY. UKCraftFairs option B remains off pending its separate transport decision. Codex did not change Claude's package or status file.

V3-004's bounded TEST matrix is ready for launch-review input; real subscriber/price coverage and migration remain gated. V3-005 is blocked on hosted-domain egress. V3-001 remains Claude-owned and open. Publication, production cutover, live billing, paid acquisition, infrastructure deletion and protected/live branch merges remain disabled.
