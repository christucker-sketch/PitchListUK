# FindPitches V3 production incident — public root returns JSON 403

Reported by Chris from a real iPhone/Safari production check on 2026-10-11 at about 22:16 London.

## Observed behaviour

Opening `https://findpitches.com/` on the real public hostname returned a JSON document instead of the Build 4 homepage:

```json
{"ok":false,"error":"forbidden","message":"Please check your request and try again."}
```

Safari identified the response as `document.json`, strongly indicating that the apex/root request is reaching a JSON/API/security branch rather than the public static/frontend route.

This observation supersedes any earlier launch smoke claim that the real anonymous apex homepage was healthy. Treat public-origin acceptance as incomplete until this is reproduced/fixed and re-proved from the real hostname.

## Codex — immediate P0

1. Reproduce against the actual production host with no preview/session credentials:
   - `https://findpitches.com/`
   - `https://findpitches.com/index.html`
   - `https://findpitches.com/pricing.html`
   - representative public search/browse pages.
2. Inspect production Worker route precedence and request classification. Public frontend/static routes must resolve before protected API/auth/operator guards.
3. Keep genuinely protected surfaces protected: account/session mutation, operator/admin, webhook, internal API and other non-public endpoints must not be weakened to fix `/`.
4. After the fix, run the real-origin anonymous browser/public smoke again, including response content type, homepage assets, navigation, Free redaction, pricing, SEO/indexability and security headers.
5. Re-run representative protected/API checks separately to prove the fix did not broaden access.
6. Verify `pitchlist.uk` remains unchanged and healthy.
7. If LIVE Checkout is exposed while the public shell is broken, close Checkout until the real public-origin smoke is green again. Preserve webhook/Portal/cancellation access for any LIVE objects.
8. Update the controlled-launch report and own status with the cause, exact deployed version, evidence and whether public launch returns to GO.

## Working hypothesis

Likely public route-precedence/request-classification bug: `/` is being handled by the API/security layer and producing the standard JSON forbidden response instead of serving Build 4. This is a hypothesis only; confirm from code/runtime evidence before changing anything.

## Stop conditions

Do not solve this by globally bypassing authentication/authorization, exposing internal APIs, mutating PitchList/shared Pages, or relaxing source/entitlement guards.

## Evidence custody

Chris supplied the real-device screenshot in ChatGPT. It shows the JSON forbidden payload and Safari offering the response as `document.json` from `findpitches.com`. No customer secrets or credentials are involved.

## Codex acknowledgement — 2026-10-12T09:04:01+01:00

Claimed under the existing V3-010 runtime ownership. Chris confirms: “Typed findpitches.com”. HTTPS probes with Mobile Safari navigation headers return HTML200, zone Always Use HTTPS is off, and current code forbids HTTP origins. External HTTP probes are not supported by this runner; this is a concrete candidate cause to verify rather than an asserted Safari trace. New Checkout closed at2026-10-12T07:57:53.086Z; public HTTPS, account recovery, signed webhook, Portal and LIVE storage preserved. Version `c118a2b1-e999-435b-a1f6-8f9396870cc1`. Scoped fix and protected regression/native proof in progress. No PitchList, source/identity, paid or customer-alert change.

## Deployed repair and acceptance status — Codex, 2026-10-12T09:53:00+01:00

[Detailed incident evidence](../docs/findpitches-v3-public-root-incident-2026-10-12.md). HTTP public navigation now redirects to HTTPS, with old403 regression reproduced and new301 passing. Code version `7676cb7d-6535-4a95-ac02-8389e57c2ebc`, current restored-browsing flag version `fb9601db-13f1-4bd2-b209-e7eff37baa74`. Native29/browser25 including actual root HTML pass; full264/focused21 and source preservation pass. First Wrangler deploy regenerated the two own-route IDs, caught and safely paused; corrected version upload/deploy preserves current route IDs, native settings and all protected systems.

**PENDING REAL-DEVICE RECHECK; not closed on Chris's behalf.** Browsing restored with Checkout closed until the requested fresh Safari bare-domain test. External HTTP is unavailable from this runner; real-device navigation is not inferred from an HTTPS-only smoke. Then guarded Checkout reopening and separate genuine owned customer/Portal acceptance can proceed under D-014/D-016. No paid/source/customer/legacy/PitchList change.

## Real-device recovery confirmed — Codex, 2026-10-12T10:42:00+01:00

Chris completed the requested fresh Safari Private-tab bare-domain test and replied **“Homepage opens normally”** in this Codex session. The public-navigation incident is resolved on actual user evidence; no external HTTP trace is claimed. Fresh native/source/preservation checks are in progress before guarded Checkout reopening under existing D-014/D-016. Genuine owned Checkout/global Pro/Portal acceptance is still separate and pending.
