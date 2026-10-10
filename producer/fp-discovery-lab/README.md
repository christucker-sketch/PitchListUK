# FindPitches Discovery Lab (`fpd`)

This is a clean-sheet discovery engine for **trader, vendor, stallholder and exhibitor
opportunities at events** in the UK, US, Canada, Australia, New Zealand and Ireland. It runs locally,
stores everything in SQLite, can be stopped and resumed at any time, and keeps the provenance of
every decision.

* How it works and why: **[DESIGN.md](DESIGN.md)**
* What it found: **[RESULTS_R2.md](RESULTS_R2.md)** (round 2, current) and [RESULTS.md](RESULTS.md) (round 1),
  plus `output/`: `report.html` dashboard, `report.md`, `metrics.json`, `opportunities.csv`, `watchlist.csv`

## Quick start (Windows, macOS or Linux; Python 3.10+)

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate     macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                # optional; set FPD_CONTACT to an email/URL for the crawler User-Agent

python -m fpd seed curated            # platform sitemaps + directory/association hubs (seeds.json)
python -m fpd seed wikidata           # entity seeds; run repeatedly until all countries are done (rate-limited endpoint)
python -m fpd seed councils           # local-authority organisers (GB, AU, NZ); one country per call
python -m fpd crawl --minutes 30      # time-boxed crawl; Ctrl-C or kill at any time, then re-run to resume
python -m fpd report                  # writes output/report.md, report.html, metrics.json, opportunities.csv
```

Other commands:

| Command | Purpose |
|---|---|
| `python -m fpd status` | Frontier and opportunity counts |
| `python -m fpd show <id>` | Audit one opportunity: fields, every source URL, generator, classifier version, content hash, quoted evidence |
| `python -m fpd sample --n 20 --status actionable` | Random audit sample |
| `python -m fpd label <id> correct\|wrong\|unsure --note "..."` | Record a human review; the report then shows measured precision |
| `python -m fpd rebuild [--restart] [--only-signal] [--only-generator G] [--max-seconds N]` | Re-classify cached pages with the current rules and rebuild opportunities (offline, resumable, time-boxed) |
| `python -m fpd finalize` | Recompute opportunity states, routes and watch plans (run automatically after crawl/rebuild) |
| `python -m fpd revisit [--as-of YYYY-MM-DD]` | Re-queue the revisit URL of every watch/enquiry record whose `next_check` is due |
| `python -m fpd compact [--dry-run]` | Recompress evidence pages (zstd + dictionary); reduce non-signal pages to structured extracts |
| `python -m fpd snapshot` | Copy the live DB to `FPD_SNAPSHOT` (for running the live DB outside a synced folder) |
| `python -m fpd recheck --older-than-days 14` | Re-queue uncertain records, e.g. to catch applications that open later |
| `python -m fpd seed search` | Optional Brave Search generator (needs `BRAVE_API_KEY`) |

## Integration export (producer side)

The engine publishes a versioned, file-based feed (`findpitches-discovery-export-v1`) into
`integration_export/`. Nothing else crosses the boundary. Contract: **[integration_export/README.md](integration_export/README.md)**.
Readiness summary: **[INTEGRATION_READY.md](INTEGRATION_READY.md)**.
To run the producer on a Raspberry Pi instead of a PC, see **[deploy/pi/README.md](deploy/pi/README.md)**.

```
discovery engine (SQLite, cache)  ->  fpd export  ->  integration_export/  ->  (future) FindPitches importer
```

### Exact Windows commands (PowerShell or cmd, from the project folder)

One-time setup:

```bat
py -3 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Then edit `.env`. Put the live database **outside OneDrive** (SQLite and sync clients do not mix),
and keep a mirror in the project folder:

```
FPD_DATA_DIR=C:\fpd-data
FPD_SNAPSHOT=.\data\fpd.sqlite
FPD_CONTACT=mailto:you@example.com
```

Routine operation (each step can be stopped with Ctrl-C and re-run to resume):

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

`run` indexes each platform (sitemap, or id window for UKCraftFairs), plans changed, new and due
items, crawls only that lane, re-derives states, and records a poll per source.

Other operations:

```bat
python -m fpd run --source eventeny --minutes 30 --max-new 1500
python -m fpd run --source ukcraftfairs --minutes 10 --reindex
python -m fpd coverage eventeny --band 5000
python -m fpd export full
python -m fpd status
python -m pytest -q tests
```

* Use `export full` weekly, or whenever an importer needs to reconcile. Use `export delta` after every run.
  Both write a delta. `full` also writes a new immutable snapshot.
* `export` exits with code 2 if it fails. The previous export stays published and untouched.
  `export-validate` exits with code 1 if the published export is inconsistent.
* Set `FPD_EXPORT_DIR` to publish somewhere other than `.\integration_export`.
* Example Task Scheduler action: `cmd /c "cd /d C:\path\to\fp-discovery-lab && .venv\Scripts\python -m fpd run --source all --minutes 20 && .venv\Scripts\python -m fpd export delta"`.

## Data

* `data/fpd.sqlite`: all state. Tables: `urls` (frontier and fetch log), `sites`, `assessments`
  (latest decision per page with quoted evidence and classifier version), `opportunities` (with
  `relevance`, `state`, `state_evidence`, watch fields), `opportunity_sources`, `routes` (one row per
  application route and vendor category), `page_extracts` (structured extract of compacted rejected
  pages), `audit_r2` / `audit_merges` (human audit labels), `metrics`, `api_calls`, `errors`, `runs`, `kv`.
* Raw pages live in `$FPD_DATA_DIR/cache/` (sha256-addressed; `.gz` when fresh, `.<dict>.zst` after
  `compact`). `data/evidence_pages.tar` is an archive of that cache, including the zstd dictionary.
  To audit offline: extract it next to the DB and set `FPD_DATA_DIR`.
* Credentials are only read from environment variables or `.env`. Nothing secret is stored in the DB.

## Politeness

robots.txt is honoured for every request. There is one in-flight request per host and a 2 s minimum
gap (1 s for large platforms), plus a circuit breaker on failing hosts, size caps and HTML/XML/JSON
only. The User-Agent identifies the crawler. Set `FPD_CONTACT`.

## Tests

`python -m pytest -q tests` (77 tests) covers the classifier, the application-state model and its
audit regressions, date extraction, exploration policy, entity resolution (edition guard, generic
names, distinctive-token and dated-instance guards) and frontier budgets/leasing.
`tests/test_integration.py` covers the export: ID stability, edition and recurring-date separation,
URL canonicalisation, state transitions (NEW→CLOSED, CLOSED→REOPENED, disappearance→WITHDRAWN),
geography leakage, schema validation of good and malformed records, deltas, atomic publication
(an injected failure leaves the previous export intact) and source planning.

No Anthropic API key and no search API key are needed. `BRAVE_API_KEY` is optional (see RESULTS_R2.md §11).
