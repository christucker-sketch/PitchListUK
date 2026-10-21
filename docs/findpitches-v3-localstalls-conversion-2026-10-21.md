# UK LocalStalls conversion — 21 October 2026

Measured **11:59:14 London / 10:59:14 UTC**. [Aggregate evidence](../operations/findpitches-v3/reports/uk-localstalls-conversion-2026-10-21.json) · [updated opaque producer-ID dispositions](../operations/findpitches-v3/reports/uk-producer-dispositions-2026-10-21-localstalls.json) · [single execution queue](../team/CURRENT_EXECUTION_ORDER.md).

## Commercial result

**1,740 customer-ready opportunities globally; UK207.** This follow-up moves UK204→207 and global1737→1740 with no withdrawals in its observed window. Four existing LocalStalls records checked: **three READY, one quarantined**. These are three existing entities first observed customer-ready in the available snapshots, **zero new entities and zero proven historical recoveries**. All are labelled **Contact organiser / ENQUIRY_AVAILABLE**, never open applications.

| Country | Customer READY |
|---|---:|
| UK | 207 |
| US | 1,522 |
| New Zealand | 5 |
| Australia | 4 |
| Canada | 1 |
| France | 1 |

UK source counts: MyntImage136, CJS47, LittleHummingbird11, CreativeCrafts6, **LocalStalls4**, Eventeny2, NorthamptonTownCouncil1. Against the actual 07:46 UTC UK146 baseline, net **+61 = 47 genuinely new CJS events + eight confirmed Hummingbird recoveries + six existing IDs with unproven prior visibility**, with zero UK withdrawals. This is an observed snapshot window, not a reconstructed full calendar-day ledger. The **50 genuinely-new retained milestone remains three short**; the new LocalStalls conversions do not close it.

## What changed

The LocalStalls event page already provides an event-manager form that the old cloud verifier did not recognise. The new narrow adapter requires the event's own bound title, organiser, country, physical location and date; an agreeing next-date chip; explicit trading context; enabled, unique contact fields; an organiser-bound acknowledgement; and the page's own inert event/contact configuration.

It separately fetches the exact reviewed handler and checks its **actual raw bytes** against the pinned SHA-256, then verifies the same declared contact endpoint responds to GET with **405 / Allow: POST**. Existing postcode corroboration remains where applicable. It executes no publisher JavaScript, submits no form, creates no account and sends no message. The route requires browser JavaScript and reCAPTCHA. **Delivery to the organiser is not end-to-end tested or guaranteed**; this proves a current public enquiry route, not pitch availability or acceptance.

The fourth record produced **selected_organiser_disagrees_with_proof** and remains quarantined/customer404. Original organiser selection, evidence, identity and dates were not rewritten. Generic contacts, footer forms, hidden/disabled fields, a different event/contact target, stale dates, series-span disagreement, missing geography and changed handler bytes fail closed. This is not permission to promote all remaining LocalStalls records.

UK LocalStalls retries now allow **four supporting reads**, scoped to its owned UK event URL and source platform; CJS remains eight and other sources three. This prevents a successful recovery from failing on its supporting-document budget. Serper limits, source expiry, backoff and domain retry limits are unchanged.

## Validation and operational health

- **571 full V3 tests pass**, including native D1, the 100-row preservation control, queue flow and concurrent paid-budget overflow checks. Ten new LocalStalls regression cases cover routing, inert configuration, scoped controls, dates, closure, custody and false promotion; the retry-scope regression also passes.
- **29 public checks pass**, plus four direct cohort checks: three READY responses remain Free-redacted and the quarantined response is404. No test customer, message or Checkout was created.
- **235 original facts, 25 producer receipts, 22 identity keys and four entity metadata tuples** compared: zero destructive changes. All47 CJS source scopes also compare unchanged. Additive verification receipts are retained separately.
- Three newly READY entities have future watch jobs bound to their **current** proof. Due/leased/dead core queues are clear at the snapshot. Unused source publication, customer projections and publication queue remain0.
- Bounded follow-up used **31/32 free source GETs**:15 local research/canary reads and16 native reads. It stopped after the fourth record's hold, without a forced retry. **Zero Serper reserved or attempted today** in V3; observed-credit field is null because there are no usage rows. This is not an account-wide provider audit.
- Producer-scoped pending rechecks are **230**, down from493 at09:51London; zero currently eligible for acknowledgement. This is observed producer activity, not Codex clearing requests.

Final enrichment-only release: **98609292-3be9-45c5-a89d-1ea0247ea19b**, at10:56UTC. Native bindings, secrets, runtime, schedules and settings preserved; no schema migration. Customer/billing runtime, Pi, V1/V2 and PitchList were not changed. Existing public browsing and LIVE Checkout stay on; paid/bulk acquisition and unused source publication stay off.

## Retention and next work

**CJS47/47 retained after 2.31 hours as a complete cohort; 24 hours is not yet proved.** The explicit server-render failure reached its existing daily cooldown and acquisition remains paused. Good unexpired proof remains usable; failed reads neither extend its clock nor certify source recovery. If legitimate renewal fails, original expiry and withholding apply. Actual24h observation is due **22 October09:40London**.

The same232 latest UK producer READY-labelled IDs now yield **eight customer-ready / 224 withheld**, previously5/227. LocalStalls is **4/48**, with44 still withheld. UKCraftFairs remains4/147; OptionB is off. Producer-ID membership is not exclusive acquisition-origin attribution, and matching census sizes do not establish Pi/cloud snapshot-ID equality.

Next: retain CJS safety/actual24h observation; process genuine refreshed LocalStalls evidence and review the remaining specific field/identity holds. Claude's kit **011z is prepared in the hub; installation is not evidenced here**. The organiser mismatch is feedback for source-backed producer review, not an automatic override. France, optional features and paid discovery remain deferred under the current queue.
