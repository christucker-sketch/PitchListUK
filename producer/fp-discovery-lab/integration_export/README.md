# Integration export: `findpitches-discovery-export-v1`

This directory is the **only** thing the discovery engine hands to another system. It is a
self-describing feed of trader/vendor/stallholder/exhibitor opportunities. An importer needs nothing
else: no database, crawler state or engine code.

```
integration_export/
  latest.json                         <- read this first; written LAST, names only complete exports
  schema/findpitches-discovery-export-v1.schema.json   JSON Schema (draft 2020-12) for one record
  full/
    snapshots/<export_id>/            immutable full snapshot (last 3 kept)
      current.jsonl                   currently usable opportunities (channel=current)
      watch.jsonl                     future / watch inventory (channel=watch)
      held.jsonl                      relevant but NOT ready for customer-facing use (channel=held)
      manifest.json                   counts, checksums, warnings for this snapshot
    current.jsonl, watch.jsonl, held.jsonl, current-manifest.json
                                      convenience copies of the latest snapshot
  deltas/
    <export_id>.jsonl                 records whose lifecycle changed since the previous export
    <export_id>-manifest.json
  metrics/latest.json                 health of the engine and its acquisition sources
```

## How to consume (recommended importer protocol)

1. Read `latest.json`. Remember `latest_export_id` and stop if you have already processed it.
2. **Incremental:** process every `deltas/<export_id>.jsonl` you have not yet applied, in `export_id`
   order. Each delta manifest names its predecessor in `previous_export_id`. If you find a gap, fall
   back to a full reconcile.
3. **Full reconcile** (first import, or after a gap): load `latest_full.files` (the immutable snapshot
   paths).
4. Before using any file, verify its `sha256` and record count against the manifest. On mismatch,
   treat the export as incomplete and retry later.
5. Upsert by `opportunity_id`. Use `channel`, `application_state` and `lifecycle_event` to decide
   visibility (see "Lifecycle" below).

`export_id` is a UTC timestamp, `YYYY-MM-DDTHHMMSSZ` (with a `-N` suffix if two exports share a
second), so lexical order is chronological order.

## Channels

| channel | meaning | where it appears |
|---|---|---|
| `current` | Passed the readiness gate and is usable now: `OPEN_NOW`, `ROLLING` or `ENQUIRY_AVAILABLE` | `current.jsonl`, deltas |
| `watch` | Relevant future inventory: `UPCOMING_NOT_OPEN`, `CLOSED_CURRENT_CYCLE`, `UNKNOWN`, or `HISTORICAL` with recurrence evidence. Has a `watch` block | `watch.jsonl`, deltas |
| `held` | Relevant, but failed the readiness gate (see `readiness_issues`). Not for customer-facing use | `held.jsonl` only; in a delta only as `WITHDRAWN` when a delivered record becomes held |
| `retired` | A previously delivered record that has left current/watch: it is now historical without recurrence evidence, or the engine stopped producing it | deltas only |

## Application states

| state | meaning |
|---|---|
| `OPEN_NOW` | The source shows applications/bookings being accepted now: an open phrase, a future deadline, or a live application page for a future edition |
| `ROLLING` | Recurring market with a standing application route and no closure signal |
| `ENQUIRY_AVAILABLE` | A real contact route (organiser email or platform contact) but no application mechanism |
| `UPCOMING_NOT_OPEN` | Source says applications will open later; `applications_open_on` is set only if the source publishes the date |
| `CLOSED_CURRENT_CYCLE` | Applications closed or deadline passed, edition not yet held |
| `HISTORICAL` | The edition described is over |
| `UNKNOWN` | Relevant, but availability cannot be determined from the evidence |
| `NOT_RELEVANT` | Not a trading opportunity (never exported in current/watch) |

When a source's own published date passes (event date, or deadline), the export moves the record to
`HISTORICAL` / `CLOSED_CURRENT_CYCLE` even before the page is re-fetched. This is an observed fact from
the source, and the evidence string says so.

## Lifecycle events (`lifecycle_event`)

Computed against the previous **successful** export.

| event | when |
|---|---|
| `NEW` | First time this id is delivered in `current` |
| `WATCH` | First time this id is delivered in `watch` |
| `UPDATED` | Same state, but a material field changed (`lifecycle_changes` lists which). Material fields: name, organiser, country, region, locality, venue, type, recurring, event start/end, deadline, applications_open_on, source_url, application_url, vendor categories, application routes |
| `STATE_CHANGED` | State changed, and it is not a closure or reopening (e.g. `UPCOMING_NOT_OPEN` → `OPEN_NOW`, `UNKNOWN` → `CLOSED_CURRENT_CYCLE`) |
| `CLOSED` | Was usable, now `CLOSED_CURRENT_CYCLE` or `HISTORICAL` |
| `REOPENED` | Was closed/historical, or had been withdrawn, and is usable again |
| `WITHDRAWN` | A delivered record failed the readiness gate (channel `held`), **or** the engine has not produced it for 3 consecutive exports (channel `retired`). The state is *not* changed: disappearance is never treated as closure |
| `UNCHANGED` | No change (appears in full snapshots only, never in deltas) |

`previous_application_state` carries the state at the previous export. `carried_forward: true` marks
a record the engine did not produce in this run. The last delivered version is repeated unchanged
until `ABSENT_LIMIT` (3) is reached.

## Identity (`opportunity_id`)

The format is `fdx1_` followed by 20 hex characters. It is stable across re-runs, re-crawls, internal
database rebuilds and changes of corroborating URL.

**Natural key.** The id is the hash of a natural key: `country | programme | edition`.

| Source | Programme | Edition |
|---|---|---|
| Eventeny | `eventeny:event:<event id>` | event month |
| LocalStalls | listing path | `standing` |
| ClueMart | application slug | `standing` |
| UKCraftFairs | listing id (one dated fair) | none |
| Organiser site | `site:<domain>:<normalised name>` | event year, or `standing` for rolling markets |

**Anchor registry.** Inside the engine, an anchor registry ties each id to its specific URLs and
platform listing ids. A record keeps its id when its name, date or one source URL changes.
Different annual editions, and separately bookable dates of a recurring market, get different ids.

**Routes.** Separate vendor applications (food, craft and so on) are routes inside one opportunity.
Each has a stable `route_id`, so an importer can list them separately if it wants to.

`identity.natural_key`, `identity.anchors` and `identity.resolved_by` are included for audit.

## Export-readiness gate (channel `current`)

A record is READY only if all of the following hold:

* it is a genuine trading opportunity (relevant);
* the country is supported (GB, US, CA, AU, NZ, IE);
* the country is supported by page or platform evidence, not just by the discovery query or seed;
* there is no region/country conflict;
* the event name is usable (not "Google Docs", a bare domain or a date string);
* the source URL is a valid URL, and both the source URL and the application URL (if any) use https (plain http is held as `insecure_source_url` / `insecure_application_url`, because the V3 ingest refuses it as unsafe);
* the state is a usable state;
* there is no stale contradiction;
* it is not on the known-false-positive list from human audits;
* state evidence exists.

Fields that are often genuinely unavailable (organiser, venue, end date, deadline) are never required.
Missing values are `null`, never guessed. Failures go to `held.jsonl` with `readiness_issues`.

## Record fields

Every record is one JSON object per line, UTF-8, keys sorted. All dates are `YYYY-MM-DD`; all
timestamps are UTC `YYYY-MM-DDTHH:MM:SSZ`. The authoritative definition is the JSON Schema.

| field | type | description |
|---|---|---|
| `schema_version` | string | always `findpitches-discovery-export-v1` |
| `opportunity_id` | string | stable identity (see above) |
| `channel` | enum | `current` / `watch` / `held` / `retired` |
| `lifecycle_event`, `lifecycle_changes`, `previous_application_state`, `carried_forward` | | see Lifecycle |
| `export_readiness` | enum | `READY` (current), `WATCH`, `NOT_READY` (held), `RETIRED` |
| `readiness_issues` | string[] | why a record is held/withdrawn |
| `country`, `country_code` | string / ISO 3166-1 alpha-2 | `country_code` ∈ GB, US, CA, AU, NZ, IE |
| `region`, `region_code` | string / ISO 3166-2 | `region_code` only where derivable (US states, CA provinces, AU states), else null |
| `locality`, `venue` | string\|null | as found in the source |
| `location` | string\|null | display string *derived* from venue, locality and region (not an address claim) |
| `geography_basis` | string[] | evidence for the country (e.g. `platform_place_line`, `postcode x2`, `tld:co.uk`, `platform_country:localstalls`) |
| `event_name` | string | event name |
| `organiser` | string\|null | |
| `opportunity_type`, `event_types` | string\|null, string[] | e.g. `market`, `festival`, `craft_fair`, `christmas_market`, `farmers_market`, `food_festival`, `agricultural_show`, `exhibition` |
| `vendor_categories` | string[] | categories of the application routes (`food`, `craft`, `art`, `exhibitor`, `nonprofit`, `produce`, `retail`, `general`) |
| `application_state`, `application_state_evidence`, `open_strength` | | state, one-line evidence (quoted text plus extracted dates), and `explicit` (the source says open) or `implicit` (live route, no open phrase) |
| `recurring`, `recurrence_evidence` | bool\|null, string\|null | `true` only when the source states recurrence; never assumed |
| `event_start`, `event_end`, `event_date_basis` | date\|null, string | basis: `jsonld`, `text`, `platform_title`, `platform_coming_dates` (LocalStalls dates listed without a year, resolved to the next occurrence), `site_homepage` |
| `application_deadline`, `applications_open_on` | date\|null | only when published by the source |
| `source_url` | url | primary page that supports the record |
| `application_url` | url\|null | best application or enquiry route |
| `application_routes[]` | object | `route_id`, `url`, `route_type` (`platform_page`, `embedded_form`, `onpage_form`, `form_document`, `apply_link`, `email`, `platform_enquiry`…), `platform`, `category`, `label` |
| `discovery_source` | enum | `eventeny`, `localstalls`, `cluemart`, `ukcraftfairs`, `marketspread`, `entrythingy`, `organiser_site`, `council`, `directory`, `wikidata_seed`, `search`, `osm`, `other` |
| `discovery_source_detail` | string\|null | e.g. which directory |
| `discovery_strategy` | enum | `platform_enumeration`, `platform_id_window`, `directory_follow`, `entity_seed_crawl`, `council_seed_crawl`, `search_api`, `map_data`, `other` |
| `source_type`, `platform` | enum, string\|null | type of the primary page: `platform_listing`, `organiser_site`, `form`, `aggregator`, `council_site` |
| `first_seen` | ts | when the engine first discovered a supporting page |
| `last_seen` | ts\|null | last successful fetch of a supporting page |
| `last_checked` | ts | last fetch attempt |
| `evidence` | object | `relevance[]` (quotes showing it is a trader opportunity), `state` (state evidence), `dates[]` (date quotes). Max 300 characters each |
| `confidence` | object | `level` HIGH/MEDIUM/LOW, `classifier_score` (0–1), `lane_audited_precision` (measured precision of this acquisition lane from human audits), `basis` |
| `provenance` | object | `engine`, `engine_version`, `classifier_version`, `sources[]` (`url`, `role`, `discovery_source`, `fetched_at`, `http_status`, `content_sha256`), `raw_evidence_refs[]` (`sha256:<hash>` keys into the engine's local raw-page archive; raw HTML is never exported) |
| `fingerprint` | object | `content`: hash of the supporting pages' content hashes; `material`: hash of the material fields (changes ⇔ UPDATED) |
| `identity` | object | `algorithm` (`fdx1`), `natural_key`, `resolved_by` (`minted`, `natural_key`, `anchor`), `anchors[]` |
| `watch` | object\|null | watch channel: `reason`, `priority`, `missing_evidence[]`, `revisit_url`, `suggested_revisit_date`, `revisit_date_basis` (`SOURCE_PROVIDED` = date published by the source; `INTERNAL` = engine scheduling choice), `revisit_basis_detail` |

## Manifests

Each manifest contains:

* `schema_version`, `export_id`, `export_type` (`full` or `delta`), `generated_at`;
* `engine` (name, version, classifier version, identity algorithm, git commit if available);
* `run_id`, `previous_export_id`, `previous_full_export_id`;
* `files` (`path` → `sha256`, `bytes`, `records`);
* `record_count` and breakdowns `by_lifecycle_event`, `by_application_state`, `by_country`,
  `by_discovery_source`, `by_channel`;
* `source_fetch_count`, `errors`, `warnings`.

A full manifest also has per-channel statistics and `readiness_issue_counts`.

## Versioning

Additive, optional fields may be added within v1. Any removal, rename, type change or change of
meaning creates `findpitches-discovery-export-v2`, published alongside v1 for a transition period.

## Retention

The last 3 full snapshots are kept. Deltas are kept indefinitely and are small, typically tens to
hundreds of kB. A first delta after a reset contains every record.
