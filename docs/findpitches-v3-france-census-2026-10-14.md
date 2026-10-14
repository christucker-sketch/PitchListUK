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

## Probe 5: two-hop route (DATAtourisme → organiser website), 40 API calls + 72 polite fetches

**Funnel:**
- 2,418 current trading events → 869 with an organiser website (705 distinct sites).
- 80 sampled → 61 reachable (13 blocked by robots, 6 unreachable).
- 14 with an exhibitor signal → 12–13 that the probe flagged as a route.

**Calibration of those hits:** I re-read them with the real classifier.
- **Real current route:** Seyssins. Marché de Noël, appel à candidatures, applications by e-mail before 15 Nov; event 10 Dec 2026.
- **Real route, full:** Val-de-Moder. A 42-field exhibitor form, but applicants are now placed on a waiting list.
- **Real route, possibly last year's:** Pluneret's professional PDF form, uploaded in 2025.
- **False positives:**
  - shopper pages that mention "exposants" (Valence, Gex);
  - an exhibitor directory (Steinseltz);
  - an agricultural-land call (Ornans).

**Realistic hop-two yield:** about 5% of reachable organiser sites, not 20%.

## Build: France pack v1 and DATAtourisme lane (kit `pi_kit_v3-011l`, `SHA256SUMS 88c0dcb8…`; builds `769bec3c` and `c6dfe9fd` were withdrawn after the Pi gate)

**Pack (`fpd/packs/fr.py`)** extends the shared, rule-based engine. English rules are unchanged. It covers:
- French trader vocabulary: inscription/candidature des exposants, devenir exposant, réservation d'emplacement, tarif au mètre linéaire, commerçants non sédentaires, appel à candidatures (only with market context);
- closed / waiting-list / not-yet-open phrasings;
- French dates: "samedi 5 et dimanche 6 décembre 2026", "du 27 novembre au 27 décembre", "1er", and live header clocks ignored;
- postcode → département → région (ISO 3166-2:FR) and commune;
- French phone numbers;
- negatives: marchés publics / appels d'offres (procurement), emploi/recrutement, land tenancy;
- HelloAsso, Billetweb and Weezevent recognised as routes only with exhibitor wording;
- **Chris's scope rule**: brocantes and vide-greniers are rejected unless professionals are explicitly allowed.

**Routes:**
- An e-mail address written in a candidature instruction becomes an e-mail route.
- "Inscriptions exposants au 06…" becomes a `contact_instruction` route (D-018), tied to that page. It is only accepted when the page also carries participation language.

**Lane (`fpd/generators/datatourisme.py`):** discovery only.
- Current trading events with an organiser website put that website into the frontier.
- Every delivered fact is proven from the organiser's own pages by the existing crawler and classifier.
- Nothing from DATAtourisme is copied into a record.
- At most 300 API calls an hour (the API allows 1,000), with a persistent cursor.

**Cycle:** a France step (`seed datatourisme --max-calls 20`, then `crawl --generators datatourisme:fr --minutes 12`) gives about one full national pass a day.

**Export:**
- `FR` is added to the contract enum, and `region_code` takes FR-xxx values.
- **French records stay held until `sudo fpd-v3-feed fr-on`.** That is Codex's call under V3-019.

**Tests:** Python 148, plus 147 + 1 skipped from the kit.
- 24 France tests, covering 4 real organiser-page fixtures (sanitised: organisational contacts only, form tokens redacted), dates, geography, scope, procurement, job fairs and the lane.
- Shell tests: alerts 34, prune 3, source-key 8.

**Pre-install gate:** `classifier-diff.sh` re-classifies about 4,500 stored pages, opportunity-linked ones first, with the installed engine and with the new kit. It reports every label, state or country change before anything is installed.

### Pi gate result on the first build (`769bec3c`), 14 Oct 13:17Z: 4,494 stored pages compared

- 4,460 pages were identical; 34 changed. **The gate caught real regressions, so that build was not installed.**
- **28 Marketspread US listings and one US Jotform OPEN_NOW form flipped to country FR.**
  - Cause: US ZIP codes followed by a line break ("20111⏎Go") matched the French "postcode + commune" shape.
  - Fix: postcode and commune must be on the same line.
  - Fix: French postcode, phone and "France" evidence now counts only on a French-language page (≥5% French function words). A `.fr` TLD still counts.
- **One Eventeny form (OPEN_NOW → CLOSED) and one Australian form (OPEN_NOW → HISTORICAL) changed state.**
  - Cause: "Sept"/"Dec" are also English, so "1 Sept" took the French path with its wider year window.
  - Fix: the French month list now excludes spellings shared with English.
- **Marchés publics de Montréal flipped to rejected as procurement.**
  - Cause: in Québec a "marché public" is a public market.
  - Fix: bare "marchés publics" is no longer a procurement signal; appels d'offres, DCE, pouvoir adjudicateur and BOAMP still are.
- Regression tests were added for all three. Tests: 149 Python; shell 34/3/8.
- A targeted re-check of the 34 changed pages (`classifier-diff.sh --ids …`) runs before install.

### Targeted re-check of `c6dfe9fd` (14:47Z): 28 of 30 identical, 2 still changed

- **Eventeny (US):** "Deadline: Oct 14, 2026 11:59 pm" was dropped by the new header-clock filter, so the form showed as closed. The filter now needs a dash before the time, a header position, and no deadline cue.
- **CIAF (AU):** a correction I made to year inference also moved English dates near the top of the page. The English path now keeps its historical behaviour exactly.

Both reproduce as identical to the installed engine locally. A regression test is added (150 Python tests). Rebuilt as `88c0dcb8`.
