# Codex → Claude: Germany preparation, 15 October 2026

Chris requested preliminary Germany work while Claude is unavailable. **No producer files, Pi install, country switch or DE export have been changed.** V3-023 completes preparation only. France's existing cloud/storage gates stay cleared; this does not claim `fr-on` or real French delivery. See [source research](../docs/findpitches-v3-germany-preparation-2026-10-15.md) and [sanitized inventory](../operations/findpitches-v3/reports/germany-preparation-2026-10-15.json).

## Suggested first country-pack slice

1. **LebensArt**: [26 linked 2027 events](https://www.lebensart-messe.de/alle-veranstaltungen.html), with exact event → [prospective-exhibitor intake](https://www.lebensart-messe.de/aussteller-werden.html). First fixtures: [Lübeck](https://www.lebensart-messe.de/luebeck.html), 26–28 February 2027; [Metzingen](https://www.lebensart-messe.de/metzingen.html), 12–14 March 2027. Treat this as organiser-wide enquiry/registration unless stronger wording establishes event-specific open applications. Preserve venue vs navigation addresses and distinguish the existing-exhibitor area.
2. **Nürnberg municipal**: [Ostermarkt landing](https://www.nuernberg.de/internet/marktamt/ostermarkt.html), linked 2027 application and information PDFs. Event 12–29 March 2027, Hauptmarkt; deadline 12 November 2026; Good Friday closed; €20 processing fee with receipt-by-deadline condition. One event, not 18 daily entities or two PDF entities. Do not copy municipal bank details or staff contacts into Git fixtures.
3. **Marktgilde**: [new-trader pitch enquiry](https://www.marktgilde.de/beschicker/standplaetze) is useful, but individual venues/schedules need public source proof. Operator claims 162 marketplaces, not verified READY inventory. The separate portal requires an existing vendor number: reject it for new applicants.
4. Hold Gartenkönig until a current trader route is found; its calendar PDF is not an application and its homepage contains explicit cancellations. Hold Handgemacht pending review of unrelated casino-promotional main-body content. marktcom remains directory discovery only; the sampled Munich candidate URL is a soft-404 despite HTTP 200. handmade-messe.de access is unverified after a failed robots fetch; no bypass.

## Producer-owned work when resumed

Prepare an isolated `de` country pack using the existing country-pack architecture. Do not alter English/French classification or install it on the Pi as part of this handoff. The native contract, customer market registry and producer export enum currently reject DE; **coordinate their gated compatibility change before emitting DE**. A language/country recognition change alone is insufficient.

Use [shared synthetic date/range vectors](../tests/findpitches-v3/fixtures/germany-preparation.json) as cross-language conformance inputs. [Offline JS reference](../operations/findpitches-v3/germany-preparation.mjs) is preparation, not a producer runtime dependency. It supplies 16 ISO-qualified state IDs, German month variants, explicit four-digit years, valid calendar dates and conservative ranges. Keep original strings immutable; derived normalized dates are additive. Missing year, ambiguous cross-year edition, “Stand”, copyright, deadline labels and page-clock text cannot be promoted to event dates. A parsed historical date remains historical.

Bind country to actual source-backed venue jurisdiction. `.de`, German text, +49, five-digit PLZ or the search market alone do not prove Germany; AT/CH must not leak into DE. Bare `DE` is also US Delaware in the US state map. Bind exact event, organiser, current edition and trader route before a record can pass proof. The organiser's German company address is not automatic proof of every event venue.

Apply D-018 globally but honestly: explicit current new-trader standing intake may be a usable route; visitor tickets, sponsor-only forms, generic contact, organiser registration on directories, private-seller-only or existing-vendor-only access must not pass by keyword. Preserve source-declared trader criteria and fees. Do not equate “Bewerbung” everywhere with trader application; jobs/procurement exist.

Retain exact document URL, original bytes/hash, observation time and linked-document custody independently. No silent identity/edition/country repair, fresh timestamps on unchanged facts, stale replay clearing rechecks, artificial event-per-day duplication or city-centre map pins. Keep the independent producer logically separate from cloud credentials and source verification.

## Proposed acceptance gate — not executed yet

- Producer tests plus stored-page differential against all existing markets: no unrelated classification changes; changed/new/unchanged export clocks and replay preserved.
- Codex DE intake/staging/catalogue compatibility and family-verifier tests; original-source country, date, venue, identity and current trader route required. Negative controls must stay held.
- Test-only native five-record maximum: two LebensArt, Nürnberg, up to two properly evidenced Marktgilde markets. If a slot lacks proof, leave it empty. Idempotent replay, stale rechecks, identity custody, capacity guards and zero leakage must pass.
- Report actual READY and blockers by source/region/route, then agree the next bounded free cohort (maximum 20 proposed). No Serper, automatic DE expansion, public country activation or Pi rollout is granted by this preparation.

No DE READY uplift is claimed. Codex's offline replay of five retained pages through the unchanged generic verifier produced zero verified; source-specific HTML/PDF proof is the work needed, not a weaker generic gate.
