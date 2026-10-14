# FindPitches V3 — Pi international acquisition directive

Authority: Chris, 14 October 2026.

Chris wants the dedicated Pi host to behave like an always-on acquisition engine, not a cautious maintenance appliance. The host is dedicated hardware with fast home connectivity; the operating goal is sustained, bounded, measurable acquisition throughput across multiple countries while preserving source legality, evidence quality and V3 publication controls.

## Mission change

Claude/Pi is now the **international acquisition factory**.

Primary KPI: **net-new usable opportunities delivered per country per week**, with source/operator/geographic diversity and honest evidence. Small maintenance wins remain useful but must not consume the majority of producer effort.

Codex remains publication/proof/control-plane owner. The Pi discovers, extracts, structures and delivers evidence/candidates. It does not self-promote records to READY.

## Operating model

Move from one-source-at-a-time tactical work to persistent country programmes.

The producer should run continuously within safe host/source limits and allocate work across country frontiers. Claude should improve the factory, source families and parsers; Claude should not have to supervise each individual acquisition run.

Use the same reinforcement-style approach as V3-017:

- measure READY yield downstream from each source family/country lane;
- expand winning operators, sibling events, venues, cities and regions;
- reduce effort on stale, duplicate-heavy, blocked or zero-yield source families;
- classify loss reasons and fix the largest recoverable bucket;
- preserve immutable source/evidence custody;
- no robots/challenge bypass, fabricated data or guessed trader routes.

## Immediate country priority: France

France is the first major non-English acquisition programme and should be treated as a reusable internationalisation test, not a French one-off.

Targets:

1. first **100 genuinely usable French opportunities**;
2. then **250**;
3. then **500+** with meaningful organiser, venue and regional diversity.

Build a reusable **country-pack architecture** so France teaches the producer how to expand into Germany, Netherlands, Belgium, Spain and later markets without bespoke rewrites.

A country pack should support at minimum:

- ISO country / locale;
- language-specific event vocabulary;
- trader/exhibitor/application vocabulary;
- date and address formats;
- administrative geography;
- discovery/query templates;
- organiser/source-family seeds;
- route-purpose recognition;
- normalization into V3 fields while retaining original-language evidence.

French discovery/route vocabulary should include relevant concepts such as `exposant`, `devenir exposant`, `candidature exposant`, `inscription exposant`, `marché artisanal`, `marché de Noël`, `foire`, `salon`, `créateurs`, `artisans`, `producteurs`, `emplacement`, vendor/exhibitor forms and equivalent variants discovered from real sources.

Do not translate away custody: retain original French source text/URLs and normalize separately for customer/index fields.

## Source strategy

Attack repeatable families capable of yielding many opportunities:

- municipal and regional event calendars;
- tourism and destination calendars as hop-one discovery;
- recurring Christmas and seasonal market programmes;
- artisan/creator market networks;
- food and producer markets;
- fairs, salons and expos with exhibitor intake;
- venue/operator calendars;
- recurring multi-city operators;
- trade/event associations and regional organiser networks;
- official machine-readable calendars (JSON-LD, ICS, WordPress/Tribe or equivalent) where publicly accessible.

Use two-hop discovery: event/operator discovery first, then prove the trader/exhibitor route from an organiser-controlled source.

## Throughput expectations

Do not mistake tiny repairs for the main mission.

A +7 or +18 recovery is useful maintenance, but producer success is now judged by country-scale supply growth. Bounded samples are for deciding whether a source family deserves investment; once a family is proven, enumerate it systematically rather than repeatedly stopping after a tiny sample.

The Pi should exploit its dedicated runtime by keeping a queue of safe work available between scheduled discovery/delivery cycles. Where CPU/RAM is the limiting factor, favour I/O-bound concurrency conservatively rather than leaving the host idle. Do not overload the Pi, remote sites, or the home link merely to maximize request count.

## Initial portfolio allocation

Until measured results justify changing it, use this strategic allocation of acquisition effort:

- **40% US** — continue high-value acquisition and maintenance of proven source families;
- **30% France** — new-country buildout and source discovery;
- **20% other international exploration** — primarily Germany / Netherlands / Belgium / Spain candidates and reusable country-pack work;
- **10% maintenance/rechecks/producer hygiene**.

This is an effort allocation, not a rigid request scheduler. The measured reinforcement loop may reallocate toward countries/source families that demonstrably convert.

## Autonomy

Target state: acquisition runs unattended. Claude intervenes for new source archetypes, systemic parser failures, source-policy questions, major loss buckets or architecture changes — not for every run.

The producer should maintain persistent frontier state so it knows:

- which country/source arms have been tried;
- current yield and failure reasons;
- what sibling coverage remains;
- when an arm is paused and why;
- which new hypotheses deserve exploration.

A restart/reboot must not reset acquisition learning.

## Reporting

Each meaningful country checkpoint should report:

1. country and baseline READY/usable total;
2. source families tested;
3. candidates/evidence delivered;
4. downstream net-new usable/READY count where Codex has adjudicated it;
5. distinct organisers/venues/regions added;
6. winning and losing source arms with reasons;
7. largest recoverable loss bucket;
8. next allocation decision;
9. host/source health and any genuine bottleneck.

Raw pages fetched are not a success metric.

## Immediate Claude/Pi work order

1. Design the reusable country-pack format and implement France as the first pack.
2. Build a broad France source census across major regions/cities and repeatable organiser/source families.
3. Run a bounded but materially sized France pilot sufficient to rank source families; do not stop at a handful of websites unless host/source policy requires it.
4. Deliver structured French candidates/evidence into the existing V3 ingest path without weakening publication rules.
5. Publish the first France funnel and a concrete path to 100 usable opportunities.
6. In parallel, keep US maintenance/acquisition alive, but do not let tiny US repair work consume the international programme.
7. Prepare the acquisition engine for unattended recurring operation with persistent scorecards/frontier state.

## Boundaries

- No robots or access-control circumvention.
- No private/API-key access without explicit authority.
- No fabricated dates, locations, organisers or contacts.
- No paid international search unless separately approved.
- No Pi-side READY/publication authority.
- Preserve PitchList/V1/V2 isolation and current V3 evidence rules.

The desired outcome is simple: the Pi should wake up every day having independently hauled in measurable, source-backed opportunities from multiple countries, with France proving the multilingual model and the learning loop deciding where to push harder next.
