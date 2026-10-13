# FindPitches V3 — US scale learning loop

Authority: Chris, 2026-10-13. Product objective remains D-019: thousands of genuinely usable customer-ready opportunities globally, with the US the highest-volume priority. D-018 usable-route semantics remain authoritative. This is an execution method, not a relaxation of truth/evidence rules.

## Method: iterative refinement with reinforcement-style source scoring

Do **not** build or train a new ML/RL model for this. The useful mechanism here is a closed-loop acquisition system: run bounded experiments, measure which source families actually produce net-new READY opportunities, reinforce the winners, demote the losers, and feed failure reasons back into discovery/extraction/proof logic.

This should behave like a lightweight multi-armed-bandit / reinforcement loop, while remaining deterministic, auditable and cheap.

## Non-negotiable outcome

The next success criterion is not +20 or +30 US READY. We need material growth.

Checkpoints:
- first: **+100 net-new US READY** from the current baseline;
- then: **+500 net-new US READY**;
- strategic catalogue target: **3,000–5,000+ US READY**, while preserving quality and state/operator/venue diversity.

A batch that produces lots of candidates but few READY records is not success.

## Experimental unit

Treat each of the following as a measurable acquisition arm:
- source/operator family;
- query/discovery template;
- event category;
- geography/state cluster;
- organiser type;
- source path (operator calendar, municipal calendar, fair association, venue programme, market network, etc.).

Each run must retain an immutable experiment record with:
- arm/source family;
- geography;
- queries/visits used;
- candidates discovered;
- duplicates;
- source pages successfully fetched;
- records with future/current event proof;
- records with trader relevance;
- records with a D-018 usable route;
- net-new READY;
- distinct organisers;
- distinct venues;
- distinct states;
- route type mix;
- blocked/robots/challenge count;
- failure taxonomy;
- paid credits/cost if and only if separately authorised.

## Reward / ranking rule

Rank source arms primarily by **net-new READY yield**, not raw discovery count.

Suggested score inputs, in descending importance:
1. net-new READY per source visit/query;
2. distinct organisers and venues added;
3. new state/geographic coverage;
4. usable-route conversion rate;
5. low duplicate rate;
6. low block/challenge/stale rate;
7. low cost and low manual intervention.

Apply strong penalties for:
- duplicate-heavy sources;
- social/directory-only results with no official route;
- stale/past event populations;
- sources that repeatedly require manual identity repair;
- blocked/robots-prohibited sources;
- high candidate volume with near-zero READY conversion.

## Explore / exploit loop

Use an explicit bounded loop rather than repeatedly trying random sources.

- **70% exploit:** deepen source families already proving READY yield. Enumerate sibling events, organiser calendars, venue programmes and related regional pages.
- **30% explore:** test new source families/categories/states that could scale.
- After every settled batch, rerank the arms from measured results.
- Promote winning arms into repeatable adapters/seed families.
- Demote or pause losing arms after repeated poor conversion; do not keep burning visits/credits because the source looks promising.
- A previously poor arm may be retried only when there is a concrete new hypothesis (new route semantics, parser fix, new source structure, fresh season/year, etc.).

This is the reinforcement mechanism: successful acquisition patterns receive more budget/coverage; poor patterns receive less.

## Source families to attack first in the US

Prioritise sources capable of producing many current opportunities from one repeatable pattern:

1. county/state fairs and fair associations;
2. multi-event craft/artisan market operators;
3. farmers/night/holiday market networks;
4. food, beer, cultural and seasonal festival operators with vendor intake;
5. municipal/city event programmes where vendor applications are published;
6. convention/expo and venue programmes with exhibitor/vendor intake;
7. recurring flea/antique/vintage market operators;
8. tourism/what's-on/event calendars as hop-1 only, followed by official organiser/vendor-route proof;
9. event platforms only where they expose real current vendor/exhibitor routes and do not collapse into duplicate-heavy noise.

Use two-hop discovery aggressively: discover the event/operator first, then prove the trader route from the official organiser-controlled source.

## Codex responsibilities

Codex owns the control plane and READY outcome.

1. Build/maintain the experiment ledger and source-arm scorecard.
2. Start from the current corpus and all known free/public source families.
3. Run bounded US acquisition batches and publish measured funnel numbers: visits/queries -> candidates -> proved event -> trader relevant -> usable route -> net-new READY.
4. Reallocate effort toward the highest READY-yield arms after each batch.
5. Preserve D-018 route semantics globally and all event/date/location/identity/lifecycle guards.
6. Do not spend on US/global paid search unless a separate explicit authority is recorded.
7. Coordinate source-specific work to Claude/Pi when the bottleneck is extraction/acquisition rather than V3 proof logic.
8. Capture source-backed venue/address/coordinate evidence during acquisition so V3-016 US mapping grows with the catalogue rather than becoming a later manual cleanup.
9. Report progress at meaningful thresholds, not every few listings. Minimum useful checkpoint: +100 US READY or a major blocker requiring a strategy change.

## Claude / Pi responsibilities

Claude owns producer/source acquisition mechanics.

1. Implement repeatable seed families/adapters for the source arms that Codex's measured scorecard identifies as winners.
2. Retain all D-018-valid route evidence (standing registration, organiser-wide vendor intake, trader enquiry, vendor-specific email, organiser-directed portal) so Codex can judge it.
3. Do not promote to READY on the Pi; deliver structured evidence and candidates.
4. When a source family wins, expand it systematically: sibling events, organiser children, venue programmes, regional branches, season/year variants.
5. Record upstream rejection reasons so parser/classifier fixes are driven by measured losses rather than intuition.
6. Do not build adapters for robots-prohibited/challenge-only sources unless a legitimate public path exists.
7. Keep host/delivery health separate from catalogue logic; issue one bounded install kit when a producer change has a measured expected gain.

## Failure-learning loop

For every non-READY record from a promising source, classify the dominant reason:
- no future/current date proof;
- no trader relevance;
- no usable route;
- route is generic/non-vendor;
- identity/edition ambiguity;
- geography insufficient;
- duplicate/already represented;
- source blocked;
- stale/closed;
- parser/extractor failure;
- source clock/evidence freshness conflict.

Then act on the largest recoverable bucket first.

Examples:
- parser/extractor failure -> Claude fixes extraction;
- standing vendor route not retained -> producer evidence fix;
- V3 rejects valid D-018 route -> Codex proof-rule defect;
- duplicate-heavy source -> deprioritise source arm;
- no usable route on official source -> move to another operator family rather than weakening standards.

## Guardrails

- No fabricated dates, venue pins, organiser relationships or geography.
- No weakening of D-018 event/date/location/trader/lifecycle requirements.
- No synthetic city/state/ZIP map markers.
- No challenge bypass or robots circumvention.
- No silent identity merges.
- No paid US/global acquisition without explicit separate approval.
- PitchList/V1/V2 remain protected and separate.

## Team reporting format

Every meaningful checkpoint should answer only:

1. What did we try?
2. What converted to net-new READY?
3. Which source arms won and lost?
4. Why did the losers fail?
5. What will receive more/less effort next?
6. How many new organisers, venues, states and real map points were added?
7. What is the new US READY total and distance to +100 / +500 / 3,000+?

The purpose is continuous learning and scaling, not repeated one-off searching.
