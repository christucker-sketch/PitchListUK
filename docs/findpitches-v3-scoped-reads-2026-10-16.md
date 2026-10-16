# Scoped current-proof reads — 16 October 2026

V3-029 continuation after the [bounded read-model release](findpitches-v3-proof-read-model-2026-10-16.md). Narrow market-specific API reads before transferring and mapping the international snapshot. There is no cross-request READY cache or source/identity mutation.

## Contract and preserved results

The authenticated private `GET /staging/catalogue` accepts exactly one selection: `market=GB`, `detail_id=<canonical entity ID>`, or `ids=<JSON array of up to100 canonical IDs>`. No selection means the complete snapshot. Batch IDs are deduplicated and sorted. Values are bound parameters. The existing20,000-entity limit/overflow refusal remains.

The response adds a private `scope` marker: `full`, `market`, `detail` or `ids`, with its canonical selection. An old source deployment without the marker is treated as a complete snapshot for safe rollout/rollback. Unexpected partial snapshots, mismatched market/batch content or mixed-country detail responses fail closed. No error/stale-cache fallback is added.

Market search/count/upcoming/regions and per-market SEO inventory read only the relevant country. Listing detail reads the complete target country, preserving the exact related-listing pool. Batch reads return only requested IDs. Homepage, markets, stats, combined SEO page, sitemaps, saved/alerts and scheduled inventory tracking retain global input. Public response shape/counts/sort/facets/related listings and Free/Pro redaction remain unchanged.

Both inventory and current structured-producer policy use the same selection. Query market is a filter on the retained entity, never geography proof. Selected-field/proof disagreement, current verification sequence/revision/version, LOW/channel/export/source-clock holds, quality holds/conflicts, application state/deadline, lifecycle, expiry and customer proof mapping still execute. The bounded derived heads and original immutable source evidence remain unchanged.

## Pre-release verification

504/504 full V3 tests pass,0failed/skipped, including the native100-row preservation control;33focused tests and boundaries pass. New tests compare full versus scoped public search/count/regions/inventory/batch/detail responses, including identical related listings, Free redaction, current LOW/source-clock holds, expiry, malformed/private scope rejection and legacy full-source compatibility. Global routes keep global counts.

Live D1 EXCEPT comparisons, one database snapshot per comparison, have0missing/extra rows: GB162, US1,637 cached-READY rows, detail-country162 and selected batch1. These are SQL input rows before fresh eligibility/policy filtering, not customer READY totals. Original evidence/identity writes and schema migrations:0.

Fresh pre-release health at22:40:32London:1,777READY (US1,605/GB162/NZ5/AU4/CA1), core6due/0leased/dead/stale;0paid/off/manualpause, sourcepublication/projections/queue0. Public/Checkout/recovery on; native customer/subscription1each, billing operations0/pending webhooks0. Inventory changes over time are not attributed to this performance change.

API-first compatible rollout precedes the guarded customer bundle upgrade. Final public measurements, custody and deployment evidence follow after release.
