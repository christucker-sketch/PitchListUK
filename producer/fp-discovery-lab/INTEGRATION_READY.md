# Integration readiness: producer side

**Status: the producer side is ready for integration.** The engine publishes a versioned,
validated, checksummed, atomically written feed into `integration_export/`. Nothing has been
connected to FindPitches. No production system, repository, database, Cloudflare account or API was
accessed. Nothing has been imported, deployed or pushed.

Sample export on disk (2026-10-05, validated with `fpd export-validate`):

| | export `2026-10-05T114719Z` (first) | export `2026-10-05T115023Z` (latest) |
|---|---|---|
| type | full + delta | full + delta |
| current (usable now) | 1,593 | **1,599** |
| watch (future / recurring) | 897 | **921** |
| held (relevant, not ready) | 175 | **176** |
| delta records | 2,490 (all NEW/WATCH) | **52**: WATCH 25, UPDATED 20, NEW 5, REOPENED 1, STATE_CHANGED 1 |

The second export follows a normal 2.5-minute Eventeny poll, so its delta shows what routine
operation looks like. A third, delta-only export (`2026-10-05T115616Z`) ran with nothing changed. It
produced an empty, valid delta chained to the previous export, which shows that re-exporting is
idempotent. `latest.json` now points at that delta and at the `115023Z` full snapshot.

* Current by country: US 1,120 · AU 199 · GB 164 · NZ 88 · CA 26 · IE 2.
* Current by state: OPEN_NOW 1,159 · ENQUIRY_AVAILABLE 250 · ROLLING 190.
* Current by source: eventeny 1,075 · localstalls 242 · ukcraftfairs 100 · wikidata_seed 65 ·
  cluemart 60 · directory 46 · council 5 · entrythingy 4 · marketspread 2.
* Watch by state: HISTORICAL-with-recurrence 472 · CLOSED_CURRENT_CYCLE 292 · UNKNOWN 134 · UPCOMING_NOT_OPEN 23.

## 1. Architecture

```
platform sources ─┐                                  ┌─ full/snapshots/<id>/{current,watch,held}.jsonl + manifest
organiser lanes ──┼─> discovery engine ─> fpd export ┼─ deltas/<id>.jsonl + manifest
seeds/directories ┘   (SQLite, cache,    (gate,      ├─ latest.json  (written last)
                       identity registry) lifecycle) └─ metrics/latest.json (health)
                                             │
                                  controlled handoff (files only; git-safe directory)
                                             │
                                  FindPitches importer (NOT built here)
```

* The engine's internal state stays in SQLite outside the handoff: the frontier, pages, assessments,
  opportunities, the identity registry and the export state. The raw-page cache also stays out.
* `fpd/integration/` holds the producer:
  * `identity.py`: stable IDs and the anchor registry;
  * `records.py`: the normaliser and readiness gate;
  * `schema.py`: the contract and validator;
  * `exporter.py`: lifecycle, atomic publication, validation and health.
* `fpd/sources.py` operates the platform lanes on an ongoing basis: index → plan → crawl → record poll.

## 2. Export contract

`findpitches-discovery-export-v1`: JSONL (one record per line, UTF-8, sorted keys) is canonical.

* Full documentation of every field: [integration_export/README.md](integration_export/README.md).
* Machine-readable JSON Schema (draft 2020-12): `integration_export/schema/findpitches-discovery-export-v1.schema.json`.
* `additionalProperties: false`. Missing values are `null`, never guessed.

All required fields are present:

* `schema_version`, `opportunity_id`;
* `country`, `country_code`, `region`, `region_code`, `locality`, `location`, `venue`;
* `event_name`, `organiser`, `opportunity_type`, `application_state`, `recurring`;
* `event_start`, `event_end`, `application_deadline`, `source_url`, `application_url`;
* `discovery_source`, `discovery_strategy`, `first_seen`, `last_seen`, `last_checked`;
* `evidence`, `confidence`, `provenance`, `fingerprint`.

They are supplemented by:

* `channel`, `lifecycle_event`, `lifecycle_changes`, `previous_application_state`, `carried_forward`;
* `export_readiness`, `readiness_issues`;
* `geography_basis`, `event_types`, `vendor_categories`, `application_routes[]`;
* `application_state_evidence`, `open_strength`, `recurrence_evidence`, `event_date_basis`, `applications_open_on`;
* `discovery_source_detail`, `source_type`, `platform`, `identity`, `watch`.

Source identifiers are stable enums:

* platforms: `eventeny`, `localstalls`, `cluemart`, `ukcraftfairs`, `marketspread`, `entrythingy`;
* other lanes: `organiser_site`, `council`, `directory`, `wikidata_seed`, `search`, `osm`, `other`.

No source is named after the AI or tool that built the engine.

Versioning: within v1, changes are additive and optional only. A breaking change creates
`findpitches-discovery-export-v2`, published alongside v1.

## 3. Files generated

| path | content |
|---|---|
| `latest.json` | Pointer to the latest complete full and delta exports, with checksums. **Written last.** |
| `full/snapshots/<export_id>/current.jsonl` | Opportunities that are usable now (the readiness gate passed) |
| `full/snapshots/<export_id>/watch.jsonl` | Watch export: identity, state, `watch.reason`, `missing_evidence`, `revisit_url`, `suggested_revisit_date`, `revisit_date_basis` (`SOURCE_PROVIDED` / `INTERNAL`) |
| `full/snapshots/<export_id>/held.jsonl` | Relevant records that failed the gate, each with `readiness_issues` |
| `full/snapshots/<export_id>/manifest.json` | Counts by lifecycle, state, country, source and channel; fetch count; errors; warnings; sha256 per file; previous export ids; engine version |
| `full/current.jsonl`, `watch.jsonl`, `held.jsonl`, `current-manifest.json` | Convenience copies of the latest snapshot (`full/current.jsonl` is the "current snapshot") |
| `deltas/<export_id>.jsonl` + `-manifest.json` | Records whose lifecycle changed since the previous successful export |
| `schema/findpitches-discovery-export-v1.schema.json` | JSON Schema |
| `metrics/latest.json` | Health |
| `README.md`, `.gitignore` | Contract documentation; the ignore file keeps staging, temp files, databases, HTML and logs out |

Publication is atomic, and these files are the only ones in the directory:

1. Files are written to `.staging/`, then every record is schema-validated, checked for unique ids and checksummed.
2. The files move into a new versioned directory with `os.replace`, and the convenience copies are refreshed.
3. The export state is committed to the DB.
4. `latest.json` is replaced last.

A failure at any step leaves the previous export, and `latest.json`, untouched. A test covers this
by injecting a failure.

The sample is about 43 MB on disk: 2 snapshots of about 11 MB each, the first delta (10 MB, every
record) and the second (0.2 MB).

## 4. Lifecycle semantics

The lifecycle is computed against the previous **successful** export, from engine state
(`integration_state`):

* `NEW` (first delivered in current) and `WATCH` (first delivered in watch);
* `UPDATED`: same state, but a material field changed. `lifecycle_changes` names the fields;
* `STATE_CHANGED`;
* `CLOSED`: usable → `CLOSED_CURRENT_CYCLE` or `HISTORICAL`;
* `REOPENED`: closed or withdrawn → usable;
* `WITHDRAWN`;
* `UNCHANGED`: full snapshots only.

How the lifecycle treats closure and withdrawal:

* **Disappearance is never closure.** A delivered record the engine no longer produces is carried
  forward unchanged (`carried_forward: true`). Only after 3 consecutive exports
  (`ABSENT_LIMIT`) is it emitted as `WITHDRAWN` with channel `retired`, and its state is left as it was.
* A delivered record that later fails the gate (for example, a human audit marks it a false
  positive) is emitted as `WITHDRAWN` with channel `held`. It is not silently dropped.
* When a source's own published date passes (event or deadline), the record moves to `HISTORICAL` or
  `CLOSED_CURRENT_CYCLE` at export time, before the page is re-fetched. The evidence string says so.
* `HISTORICAL` records with recurrence evidence stay in `watch`. Without it, they are `retired`.
* History is kept internally:
  * every record's last exported JSON;
  * first and last export;
  * last event;
  * the absence count;
  * a log of every export (`integration_exports`).

## 5. Identity strategy

`opportunity_id = "fdx1_" + sha256(natural_key)[:20]`, where `natural_key = country | programme | edition`.

* **Programme** for each source:
  * Eventeny: the Eventeny event id;
  * LocalStalls: the listing path;
  * ClueMart: the application slug;
  * UKCraftFairs: the listing id;
  * organiser sites: `site:<domain>:<normalised name>`.
* **Edition:**
  * Eventeny: the event month;
  * organiser-site events: the year;
  * a recurring market with a standing route: `standing`.
* **Anchor registry** (engine DB): canonical URLs (tracking parameters stripped) and platform ids
  are linked to an id. The id survives a renamed event, a rescheduled date, a source-URL switch, a
  database rebuild or a re-crawl.
  * A single shared URL is *not* enough to merge two programmes. A shared vendor page cannot
    collapse different events.
  * A programme-level Eventeny event id does not merge monthly instances.
* **Separation:**
  * each annual edition gets its own id;
  * separately listed dates of a recurring market get separate ids;
  * vendor categories are `application_routes[]`, each with a stable `route_id`, inside one opportunity.
* No auto-increment database id is exposed.

Measured on the live corpus:

| test | result |
|---|---|
| Re-run with the registry | 2,520 / 2,520 delivered ids reproduced |
| Rebuilt from scratch (registry deleted) | 2,519 / 2,520 reproduced |

The single difference was a record whose natural key depends on which of two merged sources is
primary. The registry keeps it stable in normal operation, which is why the registry must be backed up.

## 6. Export-readiness gate

To appear in `current`, a record must be:

* relevant;
* in a supported country (GB, US, CA, AU, NZ, IE);
* backed by **geography from page or platform evidence**, not from the discovery query or seed;
* free of region/country conflicts;
* named with a usable event name that is not just the organiser's name;
* sourced from a valid http(s) URL;
* in a usable state with state evidence;
* free of stale contradictions;
* not marked as a false positive by a human audit.

Everything else that is relevant goes to `held.jsonl` with reasons. Latest counts:

* geography_unverified 99;
* event_name_not_usable 53;
* event_name_is_organiser_only 27;
* unsupported_or_unknown_country 14;
* known_false_positive 10;
* geography_conflict 5.

Geography leakage was found and fixed:

* Eventeny's place line ("Nassau, N.P.", "Lake Worth, FL") is now parsed and validated.
* Out-of-scope places (the Bahamas, Puerto Rico, Mexico and others) become `NOT_RELEVANT`.
* The "(US & Canada)" timezone label is no longer read as a location.
* The discovery-query country is a tie-breaker only.

All 26 current CA records were checked as Canadian. Tests cover each case.

## 7. Platform sources: ongoing operation

`fpd run` records a poll per source in `source_polls`. The poll holds:

* the index size;
* new, changed, revisit and refresh items enqueued;
* fetched, ok, errors and rate-limited counts;
* new usable items;
* the yield floor.

`metrics/latest.json` reports for each source:

* the last successful poll and days since success;
* `stalled` (more than 8 days);
* 30-day fetched, failed and rate-limited counts;
* delivered records by channel.

| source | population | status |
|---|---|---|
| Eventeny | 25,587 vendor pages in the sitemap | **5,023 fetched (19.6%)**, newest first. Usable yield by id band: ≥55k 69%, 50–55k 50%, 45–50k 23%. Lower bands are sampled every 50th id once yield falls below 5%. 0 errors, 0 rate-limited |
| LocalStalls | 349 listings | All fetched. Refreshed every 14 days or when a date passes |
| ClueMart | 73 application pages | All fetched |
| UKCraftFairs | id window, highest live id 26,868 | Probes ahead by 150 ids daily. Unassigned ids return a generic search page and are re-probed after 20 h |

Eventeny enumeration is resumable and deduplicated (`platform_index`). It is bounded by `--max-new`
and the time box, and politely rate-limited (1 request/s, one in flight, robots.txt honoured). It
plans newest first and never re-fetches unchanged pages without cause. Historical editions are
separated from current ones by state: past editions go to watch or retired, never current.

## 8. Operational commands (Windows)

See [README.md](README.md#integration-export-producer-side) for setup. Routine operation:

```bat
.venv\Scripts\activate
python -m fpd run --source all --minutes 20
python -m fpd revisit
python -m fpd crawl --minutes 10
python -m fpd export delta
python -m fpd export-validate
python -m fpd health
python -m fpd snapshot
```

Weekly, or on request: `python -m fpd export full`. To widen Eventeny coverage:
`python -m fpd run --source eventeny --minutes 30 --max-new 1500` (repeat). To track progress:
`python -m fpd coverage eventeny --band 5000`. To run the tests: `python -m pytest -q tests`
(77 pass; the `jsonschema` cross-check is skipped if that package is not installed).

## 9. Known limitations

* **Eventeny coverage is about 20%.** At the polite rate, a full enumeration of the remaining
  ~20,500 pages needs about 6 hours of crawling. It is resumable, so it can run in 30-minute
  sessions. The yield floor keeps old low-yield id bands to a sample.
* **The Eventeny sitemap has no `lastmod`.** Changes are found by:
  * a 14-day refresh;
  * a forced refetch when a deadline or event date passes;
  * revisits of watch records.

  A change between refreshes can be up to 14 days late.
* **UKCraftFairs is intermittently unreliable.** Ahead-of-id probes can trip the circuit breaker
  (93 probe errors recorded). The breaker and daily re-probe contain this, but the lane can lag a
  few days.
* **The first delta after a reset contains every record**, about 10 MB. Importers should do a full
  reconcile on their first import.
* **Organiser, council, directory and seed lanes have lower measured precision** (≈0.84) than the
  platform lanes (0.96–1.0). `confidence.lane_audited_precision` carries this per record.
* The engine still holds a few internal duplicates that resolve to the same id. At export time
  they are merged into one record, and each merge is logged as a manifest warning (23 in the
  latest run). The feed never contains a duplicate id.
* `recurring` is `null`, not `false`, when the source says nothing. `region_code` is null outside
  US, CA and AU.
* **The identity registry is engine state.** Back up the DB (`fpd snapshot`). Rebuilding without it
  reproduced 2,519 of 2,520 ids.
* `engine.git_commit` is `null` because the lab is not a git repository. `engine.version` (0.2.0)
  and `classifier_version` are always set.
* Held records include real opportunities, mostly ones whose page lacks verifiable geography. They
  are not customer-ready by design.
* All of this is a lab run on one PC, not a hosted service. Scheduling (for example, Windows Task
  Scheduler) is up to the operator.

## 10. What the FindPitches importer will need to do

The importer is not built here. This is the contract it has to honour:

1. Read `latest.json`. Stop if `latest_export_id` has already been processed.
2. Verify each file's `sha256` and record count against its manifest. On mismatch, retry later and
   never import partially.
3. **First import, or a gap in `previous_export_id`:** do a full reconcile from `latest_full.files`.
   Otherwise apply each unseen delta in `export_id` order.
4. Upsert by `opportunity_id`. Keep a FindPitches-side mapping from `opportunity_id` to its own ids,
   and never derive FindPitches ids from list position.
5. Visibility:
   * show `channel=current`;
   * treat `watch` as non-customer-facing future inventory, or show it as "coming soon";
   * never show `held`.
6. Lifecycle:
   * `CLOSED`: show as closed or hide;
   * `REOPENED`: show again;
   * `WITHDRAWN`: unpublish, but do not mark the event closed;
   * `UPDATED`: refresh the fields named in `lifecycle_changes`.
7. Optionally list `application_routes[]` (by `route_id`) as separate vendor-category applications.
8. Do entity matching against FindPitches' existing inventory on the importer side. The
   comparison round showed only 32 exact matches among 1,290 records, so a match step is needed
   before records are published as new.
9. Treat `provenance.raw_evidence_refs` as opaque references. Raw HTML stays with the engine.
10. Monitor `metrics/latest.json`, especially `stalled_or_failed_sources` and `last_successful_export`.
