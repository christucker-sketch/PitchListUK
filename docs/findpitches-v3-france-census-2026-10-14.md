# France source census: pilot measurements (Claude, 14 Oct 2026)

Directive: [Pi international acquisition directive](../team/PI_INTERNATIONAL_ACQUISITION_DIRECTIVE_2026-10-14.md). France is the first country pack.

**How these were run:**
- On the Pi, read-only, using the producer user-agent.
- Keys for the two free open-data APIs (OpenAgenda, DATAtourisme) were entered by Chris with `fpd-set-source-key`. They are root-only, not in backups, and never printed.
- No paid search was used.
- Licence: OpenAgenda published agendas and DATAtourisme are open data (Licence Ouverte / Etalab). Attribution is kept through `hasBeenCreatedBy` and the agenda name.

## Probe 1–2: OpenAgenda (152 calls)

**Scale:** about 10,000 agendas. Agendas matching market terms: "marché" 741, "marchés de noël" 801, "créateurs" 524.

**Event quality:** 878 of 895 sampled events have a street address and about half have a registration field.

**Trader signal: low.**
- 85 active market/craft agendas → 709 upcoming events → 83 markets or fairs → **16 with trader wording**.
- Of those 16, 13 have a link, email or registration, but some are job fairs ("forum emploi") that match "stand".
- Route hosts seen: HelloAsso, Billetweb, Weezevent, organiser sites.

**Verdict:** a hop-one discovery source only. Low yield.

## Probe 3–4: DATAtourisme REST API (126 calls; limit 1,000 per hour)

**Scale:** 77,841 events and festivals.
- The `takesPlaceAt.*[gte]` filters return the full total, so they look ineffective. Dates are checked client-side.
- Emails are no longer returned. A "contact the POI" POST endpoint exists and **is not used**, because it would send messages.

**Funnel, market/fair search (14,414 matches; 10,600 read):**

| Step | Count |
| --- | --- |
| Current or future (client-side date check) | 9,364 |
| Trading-type events (Market 5,056 / SaleEvent 6,235 / FairOrShow 632 / BricABrac 328 / GarageSale 293, overlapping) | 7,164 |
| Trader-intake wording in the description ("inscription exposants", "réservation des emplacements", "€ le mètre", "tarif exposant", …) | 75 |
| …with a channel next to it (phone 14, booking contact 13, email+phone 6, email 4, link 2) | **39**: 32 data creators, 39 communes, 23 départements |
| …with street + postcode / source coordinates | 33 / 39 |

**Data-quality issues to filter:**
- permanent shops typed as events;
- records titled "A SUPP" (to delete);
- job and recruitment fairs.

**Verdict:** an excellent national hop-one map, but descriptions alone give only about 50–100 route candidates, mostly phone-only.

About 31% of trading events carry an organiser homepage. **Probe 5 is next**: it measures the two-hop route (DATAtourisme event → organiser website → exhibitor page with a form, PDF, email or phone).

## Decisions

- **Scope (Chris, 14 Oct):**
  - **Always in scope:** marchés de Noël, artisan/creator markets, producer markets, foires and salons with exhibitor intake.
  - **Brocantes and vide-greniers:** only when professionals are explicitly allowed. Records "réservé aux particuliers" are excluded.
- **Routes:** phone-only exhibitor booking ("inscriptions exposants au 06…") is an explicit trader contact instruction under D-018. **Codex** must confirm V3 accepts it, and that the export contract may add `FR`. The contract enum today is GB/US/CA/AU/NZ/IE.
