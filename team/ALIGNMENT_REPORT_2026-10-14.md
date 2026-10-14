# FindPitches V3 — team alignment report

Date: 14 October 2026
Author: ChatGPT / coordination
Authority: Chris asked for a single hub report to get Codex and Claude/Pi back onto the same current picture.

## Why this report exists

The team is not strategically split, but the latest Claude producer assessment was written from a slightly stale view of Codex state. The main symptom is Claude saying that Codex had not yet published a US scorecard, while Codex had already published `team/CODEX_US_SOURCE_SCORECARD.md` and moved the US programme further forward.

This is a coordination issue, not an architecture issue. The two sides have independently converged on the same next acquisition hypothesis: official organiser-owned calendars / repeatable multi-event operator networks.

From this point, each agent should read the current peer status plus the current scorecard before beginning a new US acquisition batch or issuing a new Pi kit.

## Current shared state

Codex current customer proof:

- global READY: 1,894;
- US READY: 1,722;
- GB 162 / NZ 5 / AU 4 / CA 1;
- original US learning-loop baseline: 1,670;
- settled programme gain: net +50 US from that baseline;
- first material checkpoint remains 1,770 US READY (+100 from baseline), so the programme is still 48 short of the target at the latest customer snapshot;
- Eventeny recent leaves initially converted well but then fell sharply, and archive / empty-parent exploration is now stopped;
- no additional US/global paid search authority has been granted and no US/global Serper spend should occur;
- V3-016 US map is live, with hundreds of mapped US opportunities across 31 states using source-bound address evidence rather than synthetic centre points;
- public site, account recovery and LIVE Checkout remain live; final owned billing journey acceptance is still separate.

Claude/Pi current source assessment:

- Eventeny below ID 37,000 has already been worked extensively by the Pi and is under 5% usable; do not brute-force the archive;
- the seven organiser seeds from Codex are individually small, past-season or otherwise weak as direct volume sources;
- ZAPP requires a private API key for the useful date/location data and is therefore excluded;
- Renegade Craft 2026 applications are closed;
- the strongest next producer hypothesis is a structured calendar extractor against official organiser/council calendars, especially common WordPress/Tribe calendar APIs and schema.org Event JSON-LD;
- D-018 producer retention work identified real upstream losses: trader emails, contact instructions and route-bearing WATCH/UNKNOWN records;
- kit `pi_kit_v3-011j.tgz` / SHA256SUMS prefix `2091be95` is prepared with a measured producer-side effect: 18 currently route-less enquiry records gain trader email routes; 78 additional possible records remain behind an explicit switch rather than being promoted automatically;
- Pi power-supply replacement remains an operator hardware item, not catalogue logic.

## Alignment decision

### 1. Eventeny is no longer the primary US growth lever

Treat Eventeny as an existing productive source that should continue normal current/fresh handling, not as the place to hunt for the next hundreds of listings. Do not crawl stale archive ranges simply to exhaust them. The learning loop has already measured diminishing returns and stopped the low-yield cohorts.

### 2. Next source hypothesis: official structured calendars

Claude/Pi should sample official multi-event organiser, council, market-network and fair-network sites that expose machine-readable event data through public mechanisms such as:

- WordPress / The Events Calendar / Tribe REST endpoints;
- schema.org `Event` JSON-LD;
- public ICS / RSS / JSON feeds;
- organiser-owned programme/calendar pages with repeatable structure.

The objective is not to scrape arbitrary event directories. It is to turn official organiser-controlled calendars into candidate rows with exact date, venue/address, organiser and source provenance, then pair them with a D-018-valid trader route.

Use a bounded sample first. Do not build a Pi adapter until the sample proves repeatability and expected READY yield.

### 3. Codex remains the bouncer and control plane

Codex owns:

- READY decision;
- experiment ledger / source-arm scorecard;
- US learning-loop reward and pause logic;
- map proof / address binding;
- customer/runtime publication;
- final measurement of visits → candidates → proved event → trader relevance → usable route → net-new READY.

Claude/Pi must deliver structured evidence and candidates, not decide publication.

### 4. Claude/Pi owns acquisition mechanics and loss recovery

Claude owns:

- official calendar/operator extraction;
- producer retention of D-018-valid routes;
- source-family adapters when measured yield justifies them;
- producer-side rejection/failure taxonomy;
- bounded Pi install kits with a stated expected gain.

The producer should add a measurable `why listings get lost` report using existing Pi records where possible. This should classify non-ready / non-delivered records into useful buckets such as no current date, no trader relevance, no usable route, generic route, identity ambiguity, geography missing, duplicate, stale/closed, parser failure, blocked source and freshness conflict.

The point is to fix the biggest recoverable bucket first rather than diagnosing by inspection every time.

### 5. `011j` handling

Do not treat the whole kit as a blanket publication change.

- The 18 route recoveries are concrete producer evidence retention and are aligned with D-018.
- The 78 possible records must remain behind the explicit switch until Codex has measured/reviewed the population under current V3 rules.
- The fairer platform-time allocation is operational scheduling only; do not count it as catalogue growth.
- Installation should occur only when Chris is happy to do the Pi touch and the acquire service is inactive as instructed by Claude.

### 6. Learning-loop reporting format is now mandatory

Every meaningful US checkpoint from either side should answer the same seven questions:

1. What was tried?
2. What converted to net-new READY?
3. Which source arms won and lost?
4. Why did the losers fail?
5. What gets more or less effort next?
6. How many new organisers, venues, states and genuine map points were added?
7. What is the new US READY total and distance to +100 / +500 / 3,000+?

Raw candidate count is not success.

## Immediate next actions

### Claude / Pi

1. Read `team/CODEX_US_SOURCE_SCORECARD.md` before starting the next source batch.
2. Rewrite the latest US producer checkpoint in the seven-question learning-loop format.
3. Run a bounded sample of official structured calendars across a handful of genuinely multi-event organisers / councils / market networks.
4. Quantify sample funnel: sites checked → calendars detected → events extracted → current/future events → trader-route matches → expected deliverable candidates.
5. Build the calendar reader only if the sample shows repeatable value.
6. Add the producer loss-reason report, preferably without extra crawling.
7. Keep the 78 possible records switched off pending Codex review.

### Codex

1. Treat the structured-calendar/operator hypothesis as the next producer acquisition experiment, not as a guaranteed win.
2. Publish the current source scorecard and latest US baseline before requesting a new producer batch when either changes materially.
3. Review the 78 possible D-018 route-bearing records once Claude's commits are visible, and classify them against current V3 proof rules.
4. Ingest any structured-calendar sample through the experiment ledger and score it like every other arm.
5. Continue to stop low-yield cohorts automatically rather than exhausting grants.
6. Keep map/address evidence attached to new acquisition so V3-016 coverage grows with the catalogue.

### ChatGPT

1. Keep this alignment report as the current coordination checkpoint until superseded by a newer joint checkpoint.
2. Watch for stale assumptions in either agent status and reconcile before new work is commissioned.
3. Keep Free/Pro disclosure policy, owned LIVE billing acceptance and any paid US acquisition authority as separate decisions.

### Chris

No strategic intervention is required right now. The only operator actions are practical ones: push Claude's pending commits if his session still cannot write, install `011j` when/if the producer change is approved for the Pi, and replace the Pi PSU when it arrives.

## Standing boundaries

- No US/global paid acquisition without a separate explicit grant.
- No robots/challenge bypass or private-API circumvention.
- No guessed dates, contacts, organiser relationships, geography or venue pins.
- No synthetic city/state/ZIP-centre map markers.
- No silent identity merges.
- PitchList remains separate and protected.
- The learning loop is iterative refinement with deterministic reinforcement-style scoring; it is not a new ML/RL training project.

## Definition of aligned

The team is aligned when both Codex and Claude are working from the same current US baseline and scorecard, the next source experiment is explicitly named and bounded, the producer reports losses in measurable buckets, and any new adapter/kit is justified by expected net-new READY rather than candidate volume.
