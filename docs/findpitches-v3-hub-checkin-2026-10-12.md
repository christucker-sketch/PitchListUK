# FindPitches V3 team check-in — 12 October 2026

Codex status edit **2026-10-12T08:53:18+01:00**. [Machine evidence](../operations/findpitches-v3/reports/hub-checkin-2026-10-12.json). Native inventory/configuration observed **2026-10-12T07:45:36.343Z**; public reads **2026-10-12T07:48:38.705Z**; source/producer **2026-10-12T07:45:30.968Z**. GitHub was current at `6faf41da4c5d15f9eb7e968e198dff3fdb7f6c1e` with no new peer commits since the launch checkpoint.

**P0 Safari/bare-domain403 is under repair; new Checkout is paused.** Earlier HTTPS200 measurements below are timed observations, not a dismissal of the real-device failure. [Incident](../team/PRODUCTION_INCIDENT.md). Account recovery/webhook/Portal/storage are retained. After repair and re-proof, genuine hosted Checkout → global Pro → Billing Portal acceptance still remains. No new launch/pricing approval or credential transfer is required; D-014/D-016 apply, and both native provider configuration probes pass.

## Current observations

- Customer-ready inventory **1,778**: **GB 127 / US 1,645 / AU 2 / NZ 4 / CA 0 / IE 0**. This is the proof-filtered customer snapshot. Net change versus yesterday's launch snapshot is **-33**, all in US. Item-level cause was not attributed in this check-in; this count comparison does not establish which records changed or why.
- Actual public homepage/health/anonymous session all200; homepage indexable, anonymous access Free, customer alerts disabled. Native billing/mail probes200.
- Production version remains `40f060a5-dbaa-409b-adb3-3caa9bd24eac`, deployment `7f008cb0-7cec-45f4-a8df-20c796fb6970`; exact FindPitches apex/www routes retained. Protected PitchList homepage200 and Pages deployment `7f359dff-0702-4acb-aa69-2f28859c91ce` unchanged.
- Production customer counts: customers0, Stripe mappings0, subscriptions0, Checkout attempts0; pending webhooks0. One signed LIVE subscription-update receipt processed without an error. With no V3 customer ownership mapping, that event was ignored and grants no Pro; it proves transport, **not** a genuine owned customer journey.
- V3 paid queries today0; bulkoff/commercialmanualpaused. Due0/leased0/dead0; 9,237 future watch jobs are not due backlog.
- Pi contacting/cadence verified; last authenticated poll2026-10-12T07:31:43.468Z, source lastchecked2026-10-12T05:45:30Z, freshness warningfalse. Pending rechecks **165**, versus314 at the launch snapshot.
- Both Nashville identities remain0 eligible. Codex's recorded outcome is **KEEP_BOTH_WITHHELD**, with the old request open; no identity merge, field repair or acknowledgement write was made.

## Handoffs

**Codex:** ready to verify the real owned LIVE webhook/canonical global entitlement and Portal/cancellation result once Chris completes the customer journey. Normal transactional sign-in/billing is authorized; synthetic LIVE customers are not used as acceptance proof. No code/deployment work started by this check-in.

**ChatGPT:** your own status still dates15:22 on11October, before approval/implementation. Please reconcile the [controlled public launch evidence](findpitches-v3-controlled-public-launch-2026-10-11.md) with D-014/D-016, refresh your own file and coordinate remaining operator acceptance. Another launch approval is not the blocker. No acknowledgement is assumed.

**Claude:** your status still dates18:25 on11October. The requested Nashville outcome was supplied in the20:20 handover; acknowledge it and update V3-001 appropriately. Keep both withheld. Confirm PSU replacement, backup/restore custody and the external V3-side C3 notification owner; source/contact telemetry is checked here, but this check-in does not prove an overnight paging service. No producer kit or token was changed.

## Evidence limits and closed gates

Yesterday's full260/260, scoped6/6, public27/27 and browser22/22 in each Checkout state remain retained **11October** evidence; they were not rerun for a documentation check-in. The last full source/identity preservation audit at **2026-10-11T19:41:54.475Z** found zero destructive mutations and identity changes; it was not rerun today. Today's source/identity writes by Codex are0 because all runtime work is read-only.

Paid acquisition, customer alert delivery, legacy subscriber migration, UKCF Option B, destructive changes and protected/live merges remain closed. No deployment, route change, paid query, email, customer provisioning or provider-object write was made by this check-in.

## Incoming update and mitigation — 2026-10-12T09:04:01+01:00

**P0 incident acknowledgement — Codex, 2026-10-12T09:04:01+01:00:** ChatGPT's `b490f953` [real-device403 report](../team/PRODUCTION_INCIDENT.md) received. Chris confirms he typed bare `findpitches.com`. Native HTTPS/Mobile-Safari-UA root/index/pricing/Finder return200; zone Always Use HTTPS is off, and the Worker rejects HTTP-origin public documents before rendering. External HTTP is unavailable from this runner, so exact Safari attribution remains under verification. **New Checkout closed at2026-10-12T07:57:53.086Z**, public HTTPS/account recovery/webhook/Portal/storage remain available, unrelated bindings preserved; paused version `c118a2b1-e999-435b-a1f6-8f9396870cc1`. Codex owns immediate scoped public-navigation repair + regression/full suite + customer-safe V3 release and real-origin re-proof. Earlier healthy probes do not supersede the real-device acceptance failure. Other gates stay closed; PitchList untouched.

This updates the initial check-in: one new peer incident commit arrived after the original fetch, and one owned reversible Worker flag update closed Checkout. No code release, source/identity/route/Pages/provider/customer-object write or message has occurred yet.
