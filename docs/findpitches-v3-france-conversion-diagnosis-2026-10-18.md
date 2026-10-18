# Why French conversion is poor — 18 October 2026

**One customer-ready opportunity from29 reviewed is a3.45% conversion rate. This is not an adequate French inventory result.** At21:09 London, France still had29commercial entities,3sourceverified and1customerREADY. Two verified calls remain producer-LOW;26others unproved. The US renewal gains in the earlier report are separate and do not improve France.

[Aggregate evidence and source-bound cases](../operations/findpitches-v3/reports/france-conversion-diagnosis-2026-10-18.json). This follow-up used **nine additional free direct requests of a20-request cap**, zero Serper, no imports/promotions/runtime/producer/Pi changes. It produced no additional READY. Standing source verification and transport continued independently.

## The problem is broader than weak source selection

Some discovered pages are genuinely wrong: the Reichshoffen council-youth candidacy is not trader intake, and directory/editorial/expired/full pages remain unsuitable. But it would be wrong to attribute all26 unproved records to bad sources. Genuine current exhibitor calls also have erroneous extracted fields or lack V3 multi-document proof coverage.

The current French official-call adapter covers three curated routes. The conservative generic fallback cannot establish every event from an arbitrary municipal page plus a PDF or external form. More source-specific proof is needed, but individual hard-coded exceptions alone will not produce a commercial national catalogue.

| Case | Measured problem | Source-backed next action |
| --- | --- | --- |
| Angers horse show | Selected regionBretagne/start14Nov; official call saysAngers/13–15Nov2026. Independent government commune49007 is region52, Pays de la Loire | Fix event-scoped geography/date extraction; reconcile explicit corrected evidence without rewriting history or silently changing identity |
| Plouarzel Saveurs & Déco | Selected organiser“Google Docs”; official call namesPlouarzel animation and24–25Oct2026 | Separate the form provider from organiser identity. Prove current linked form separately |
| La Verpillière | Selected event start25September; the site calendar describes a25September–20November **application window**, while the actual market is6December2026 | Distinguish application-window/calendar metadata from event dates; retain20November as the stated submission deadline |
| Saint-Marcellin | Selected event title is generic municipal site branding; scoped article names the19December2026Christmas market | Fix title extraction and complete official-call/PDF/identity proof; no automatic renaming |
| Nancy Habitat Déco / Métiers d’Art / Antiquaires | Incomplete selected“Vand” location; organiser/end date absent. Current event-specific Calypso form has24enabled static controls | Prioritise event-bound Calypso proof plus official venue/date/organiser evidence; controls alone do not prove readiness |
| Marché Gourmand d’Occitanie | OPEN_NOW selected despite a first-contact route; event geography/organiser/date proof incomplete | Bind official event facts to the GL Events/enquiry route; preserve ENQUIRY semantics unless explicit open applications are proved |
| Kilstett/Hochstatt | Source proof succeeds, but producerLOW holds remain | Genuine source-backed producer required-field/confidence correction and fresh export; no relabel or cache timestamp workaround |

These are **eight named entity cases**, not eight guaranteed recoveries. Most still have multiple proof/selection gates. Resolving the two LOW holds alone would make only3/29customerREADY,10.34%; that would still be a poor national inventory result.

## Fresh source checks and reusable families

- **Nancy/Calypso:** official exhibitor call, official venue page and the linked2027candidature page all returned200. The candidature has24enabled static controls and a“Suivant” step. No form was submitted. Standard `<input type=submit>` detection alone does not describe this wizard, so the reader needs explicit event-bound form/step semantics and negative login/closed/wrong-edition cases.
- **Marché Gourmand/GL Events:** official call has8enabled controls and a submit. Its linked2026landing explicitly describes first contact; the client-rendered page has no ordinary static form controls. This is a promising enquiry bundle, not proof of OPEN_NOW or the event's geography.
- **Plouarzel/Google Forms:** the event-specific form was reachable, but its static inputs are disabled. Reachability or matching title does not prove a usable current submission. The existing form reader needs the correct bounded proof path, while the organiser error must be repaired independently.
- Independent official commune checks corroborated Angers49007/region52, Plouarzel29177/region53 and LaVerpillière38537/region84. These checks corroborate named places; they do not infer event identity or a venue from a page publisher's address.

The most useful patterns to qualify next are official organiser/council call→event-specific application, Calypso candidature and GL Events exhibitor enquiry. PDFs/forms remain valuable when linked to a concrete event. Social/editorial pages, bare platform indexes and visitor tickets remain low priority. No new broad paid/city discovery is proposed.

## Implementation handover and order

**Claude / producer:** work the source-backed correction cases above before simply repeating these IDs. The reviewed repository's organiser fallback in[`classify.py`](../producer/fp-discovery-lab/fpd/classify.py) can use`og:site_name`; that is a specific code path to investigate for“Google Docs”, not a claim that the currently installed Pi has been debugged. Check[`dates.py`](../producer/fp-discovery-lab/fpd/dates.py), event scoping and[`geo.py`](../producer/fp-discovery-lab/fpd/geo.py) against the Angers/application-window cases. Deliver real new evidence through the existing producer ID/content-hash/last_checked contract. Host state/install is unchanged by Codex.

**Codex / V3-020:** implement a reusable official-event plus application-bundle proof path, starting with the qualified source families above. Keep a representative corpus of positive/closed/login/unrelated/contradictory cases. Source facts, clocks, identity, proof expiry and confidence gates remain intact. Do not add generic French keyword promotion or count every municipal page as an opportunity.

There is also a selection-model constraint: independent producer fields currently have authority100, while direct-form/official evidence uses95/90 and normal extracted proof60. Source verification can add missing fields, but cannot simply replace wrong producer values. **Do not solve this by globally raising verifier authority or overwriting originals.** Use genuine producer corrections, or a separately designed, audited, provenance-bound additive correction/reconciliation path; identity-affecting discrepancies require explicit decisions. This constraint is an engineering priority, not evidence that the erroneous values are true.

Measure the next work in customerREADY gained and retained, with per-source conversion and rejection reasons. Discovery volume, a reachable form or another one-off parser is not commercial success. This report establishes a concrete correction/proof backlog without forecasting READY upside that has not been demonstrated.

V3-033 diagnosis complete; V3-020 implementation remains active. V3-032 renewal/storage measurements still need the actual19/20October16:45London observation points. Paid acquisition remains paused, V2/PitchList unchanged, no source/identity overwrites or confidence bypass. The prior541-test deployed runtime baseline remains valid; this read-only report did not rerun it or claim a new deployment.
