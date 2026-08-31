# FindPitches Global Platform Plan

## Objective

Evolve the current PitchList UK + FindPitches US implementation into one global FindPitches platform with country modules that share architecture, code, deployment, search, acquisition, validation and operations while preserving country-specific semantics.

Target public structure:

- `findpitches.com/` — global entry point
- `findpitches.com/us/` — United States
- `findpitches.com/uk/` — United Kingdom
- `findpitches.com/ca/` — Canada
- `findpitches.com/au/` — Australia
- `findpitches.com/nz/` — New Zealand
- `findpitches.com/ie/` — Ireland

Country routing must never trap users by IP. Location/locale can suggest a country, but users must always be able to select another market explicitly.

## Architecture principles

1. **One platform, country modules.** Shared components and services live once. Country-specific behaviour is configuration or adapters.
2. **Shared acquisition engine.** Discovery, fetch, extraction, validation, dedupe, checkpointing and deterministic PR handoff run in Cloudflare. Countries provide geography, vocabulary, source/query configuration and formatting rules.
3. **No local acquisition forks.** Hal remains orchestrator/reviewer/merger/deployer; acquisition logic remains production Cloudflare logic.
4. **Stable country contract.** Every country declares locale, currency, date format, geography model, postal terminology, canonical path and discovery vocabulary.
5. **Migration without service interruption.** Existing `pitchlist.uk` and current `findpitches.com` routes remain live until equivalent country routes are verified.
6. **Country-aware APIs, not country-specific copies.** Prefer shared endpoints accepting/resolving a country context over proliferating `/api/us-*`, `/api/uk-*`, etc.
7. **Country-aware SEO.** Canonicals, hreflang, sitemaps and structured data must be generated from the country registry.
8. **Global operations.** Health, source coverage, workflow checkpoints, yields and deployment state should be observable by country from one operational model.

## Target repository shape

```text
platform/
  countries.mjs                 # canonical country registry
  routing/                      # country/host/path resolution
  search/                       # shared search model + geography adapters
  acquisition/                  # shared Cloudflare acquisition contracts
  operations/                   # shared checkpoint/health model

src/
  global/                       # global landing experience
  shared/                       # shared web components/assets
  countries/
    us/
    uk/
    ca/
    au/
    nz/
    ie/

operations/
  cloudflare-acquisition/       # eventual neutralised shared worker/workflows
    engine/
    countries/
```

The exact physical migration can be incremental. Existing paths should not be renamed solely for cosmetic reasons while live growth is active.

## Country contract

Each country definition must include at minimum:

- `code`
- `name`
- `status`
- `canonicalPath`
- `locale`
- `currency`
- `dateFormat`
- postal label/format
- regional unit label
- acquisition vocabulary
- search vocabulary

The initial registry treats US and UK as active markets and CA/AU/NZ/IE as planned markets.

## Delivery phases

### GP-001 — Global foundation

**Goal:** introduce a tested country registry and architecture contract with no production routing change.

Deliverables:
- architecture plan
- `platform/countries.mjs`
- registry tests
- active/planned market metadata

Exit criteria:
- CI green
- no production behaviour changed
- US growth controller unaffected

### GP-002 — Country-aware routing foundation

**Goal:** replace hard-coded FindPitches-US host assumptions with a tested router capable of global root + explicit country prefixes.

Required behaviour:
- `/` can become global landing when enabled
- `/us/` resolves US
- `/uk/` resolves UK
- countryless legacy routes remain compatible during migration
- shared assets/APIs continue to pass through correctly
- internal source paths do not leak as public duplicates

This phase must be feature-gated until the global landing exists.

### GP-003 — Shared web shell and design system

**Goal:** centralise header, country selector, search controls, opportunity/category card structures, footer and analytics conventions.

Country themes may differ visually. US can retain its stronger Americana treatment; UK should get a polished British treatment without duplicating application logic.

### GP-004 — Canonical US module

**Goal:** move the existing FindPitches US experience to the canonical `/us/` country module while preserving existing root behaviour until cutover.

Work includes:
- nationwide finder copy cleanup
- remove remaining Texas-only UI assumptions
- country-aware canonical metadata
- route compatibility tests

### GP-005 — UK module + acquisition migration

**Goal:** make the UK a first-class FindPitches country and migrate UK acquisition into the same Cloudflare-hosted architecture used by US.

Must preserve UK-specific:
- postcode semantics
- UK geography
- DD/MM/YYYY
- trader/stallholder/pitch vocabulary
- UK source/query families

`pitchlist.uk` remains operational during transition and can later redirect/canonicalise to `findpitches.com/uk/` after verification.

### GP-006 — Shared country-aware API/search

**Goal:** converge country-specific API behaviour behind a common contract.

Expected shape:
- country context resolved from path/host/request
- geography adapter per country
- common result schema
- shared category taxonomy with localized aliases
- no accidental cross-country result leakage

### GP-007 — Global landing and cutover

**Goal:** make `findpitches.com/` the global entry point.

Features:
- country selector
- optional locale/IP suggestion only
- explicit manual country choice always available
- links to `/us/`, `/uk/`, etc.
- global SEO/hreflang/sitemap strategy

### GP-008 — Neutralise infrastructure names

Only after routing/acquisition are stable:
- `pitchlistuk` Pages project → neutral FindPitches web naming where safe
- `pitchlist-texas-acquisition` → neutral FindPitches acquisition naming where safe

Renaming must never be mixed with behavioural migrations.

### GP-009 — Canada first expansion template

Canada becomes the first proof that a new market can be added through country configuration/adapters rather than a bespoke fork.

Success means future AU/NZ/IE additions are mostly configuration + geography/query/source work.

## Operational safeguards

- Global-platform work must use isolated branches/PRs.
- Do not modify active US opportunity/source data as part of architecture PRs.
- Do not interrupt or restart the active US growth controller solely for platform work.
- Every routing migration needs host/path regression tests before merge.
- Every acquisition migration needs checkpoint/retry/dedupe tests and a country canary before enabling recurring execution.
- Preserve current production deployment and API health until replacements are verified.

## Immediate implementation sequence

1. Land GP-001 country registry and tests.
2. Audit all remaining hard-coded `US`, `Texas`, `UK`, postcode and host assumptions.
3. Build GP-002 country resolver behind current routing behaviour.
4. Build shared global web shell without switching the public root.
5. Canonicalise US under `/us/`.
6. Build `/uk/` and migrate UK acquisition into shared Cloudflare architecture.
7. Cut root to the global landing only after both `/us/` and `/uk/` are production-verified.

## Success definition

The platform is successful when adding a new English-speaking country does not require cloning the site or acquisition engine. A new market should primarily require:

- a country registry entry
- geography adapter/config
- localized vocabulary/query packs
- approved source/discovery configuration
- country theme/content
- canary + production enablement
