# Codex handoff: FindPitches V3 production capacity, renewals, SEO branch review (13 Nov 2026)

**Authority.** Chris approved this on 13 Nov 2026 in Claude's Cowork session ("approved. Please prepare the Codex handoff"). **The immediate priority is FindPitches V3 production database capacity.**

**From:** Claude. **To:** Codex.

**Background:**
- [Claude's audit and SEO branch report](../docs/findpitches-v3-seo-launch-audit-2026-11-13.md) is on branch `findpitches-v3/seo-launch-fixes`, commit `eba33da9`.
- That branch is not deployed and is based on `45f6a541`. It contains no Mycelium commits.

## Controls (apply to everything below)

- Investigate production **read-only first**.
- No production deployment, data modification, DNS change or billing change without Chris's explicit approval. This includes delete, truncate, VACUUM, migrations, archival writes, cron or var changes, and WAF/security changes.
- Keep Mycelium (including `802747e2`) and PitchList V1 changes separate from this work.
- Never print or commit secrets, customer data or raw source documents.
- **Return an evidence-based remediation plan.** Each proposed change needs:
  - risk;
  - tests;
  - an exact rollback procedure;
  - the approval it needs.
- **Keep queries cheap.**
  - Prefer `MAX(rowid)`, indexed ranges, `dbstat` or sampling over full scans.
  - Claude's own audit included one un-indexed join that read 14.3M rows and took 34 s on the production shadow DB. Don't repeat that pattern while visitors are being served.

## Evidence Claude gathered (read-only, 13 Nov, about 10:00–10:45Z)

**Shadow D1 database** `findpitches-v3-shadow` (`75ccfd1a-…`):
- Size was **7.914 GB** at 10:00Z and 7.927 GB by about 10:40Z.
- Its own `storage_capacity_samples` show the trend:

  | Date | Size |
  |---|---|
  | 20 Oct | 4.59 GB |
  | 1 Nov | 6.13 GB |
  | 13 Nov | 7.91 GB |

- That's about **140–160 MB a day**. Against the 10 GB per-database limit, it fills in **about 14 days (around 27 Nov)**, or sooner if growth is bursty.
- **Archival appears to have been one-off.** The latest `source_document_storage_events` row is `archived` at **2026-10-15T06:14:36Z** (V3-021), with nothing since.
- **High-water marks:**

  | Table | Value |
  |---|---|
  | `source_documents` rowid | 127,977 |
  | `source_document_archives` rowid | 30,498 |
  | `source_verifications.sequence` | 122,015 |
  | `source_renewal_attempts.sequence` | 76,493 |
  | `producer_records` rowid | 92,652 |
  | `jobs` rowid | 605,701 |

- **Hypothesis to test:** the growth comes mostly from new `source_documents.document_json` and `source_verifications.report_json` produced by renewals and rechecks, plus `jobs` history. The V3-021 archive tier exists but isn't running continuously.

**Renewals:**
- **UKCraftFairs** (`www.ukcraftfairs.com`): **879** `source_renewal_attempts` since 20 Oct, the latest at 13 Nov 06:48Z, all `source_result`. 98 GB entities are WATCH, and 99 carry `source_http_520`.
- **CJ's Events Warwickshire** (`www.cjseventswarwickshire.co.uk`):
  - The last attempt was **25 Oct 22:54:50Z**. Before that came 226 `source_result` attempts and 4 `transient_failure`/`source_render_incomplete` attempts (retry exhausted, 21–22 Oct).
  - **43 GB entities are still cached `readiness=ready`**, but their proofs expired on 26 Oct, so they aren't customer-visible. 31 of them are future events.
- **Earlier context:** Claude's 4 Nov agent file notes UKCF fetches working from the Pi (home IP) but not from V3, and an open policy question on accepting Pi-retained evidence.

**Customer production D1** (`b2738da7-…`):
- `customer_operation_events` `service_unavailable` per day:

  | Date | Count |
  |---|---|
  | 6 Nov | 104 |
  | 7 Nov | 56 |
  | 8 Nov | 311 |
  | 9 Nov | 366 |
  | 10 Nov | 208 |
  | 11 Nov | 176 |
  | 12 Nov | 164 |
  | 13 Nov | 1,049 |

  About 500 of 13 Nov's count came from Claude's audit crawl. `rate_limited` was 998 on 6 Nov.
- **Webhooks:** 268 live Stripe events since 12 Oct, with 0 unprocessed and 0 errors. PitchList V1 events are received and correctly `unowned_ignored`.
- **Customers:** 2 V3 customers and 1 subscription (cancelled). No active paying V3 subscribers.

**Catalogue read cost per page view** (measured read-only):
- The inventory query reads about 22.7k rows, takes about 55 ms and returns about 3.1 MB of JSON.
- The structured-policy query reads about 167.6k rows and takes about 66 ms.
- That runs for every country, region, category and listing HTML request and every catalogue API call. ID-scoped reads still materialise the full policy CTE.

**Not visible to Claude:** zone routes, WAF and bot rules, Worker logs and analytics. These need your operator token.

## P0: database capacity and growth (start here)

1. Do a read-only profile of the 7.9 GB database:
   - the largest tables **and indexes** (use `dbstat` if D1 permits, otherwise row counts × sampled `length()`);
   - the largest TEXT/JSON columns;
   - free-page and fragmentation share.
2. Measure record growth by table over the last 7 and 14 days using the timestamp columns. Attribute the 140–160 MB a day to specific tables and producers or workers, including renewals, rechecks, enrichment, eligibility, readiness, jobs and `serper_*`.
3. Investigate retained HTML and evidence, processing records, retry history and duplication. For example:
   - identical `content_hash` stored repeatedly by renewals of unchanged pages;
   - superseded verifications whose reports are never read;
   - completed `jobs`.
4. Confirm whether the V3-021 archive path (R2 plus `source_document_archives`) stopped after 15 Oct and why. Size what it would reclaim today.
5. Give options with reclaim estimates, risk and rollback:
   - resumed or continuous archival;
   - content-hash dedupe (store a reference rather than a copy on unchanged renewals);
   - retention for jobs and attempts;
   - report slimming;
   - compaction after deletion, noting what D1 actually reclaims.
6. Assess whether a larger architectural change is needed, such as moving evidence entirely to R2, sharding by market, or splitting pipeline state from the customer projection.
7. **Do not delete, truncate, VACUUM, migrate or modify production data without approval.** Include a dated "days to 10 GB" projection with your plan.

## P0: source renewal failures

1. **UKCraftFairs:**
   - Find what the 879 attempts are and why they run so often.
   - Find out what the HTTP 520 is. For example, origin rejection of Cloudflare egress, user agent, rate, or an origin fault.
   - Check whether each attempt stores a new document or verification, which feeds the P0 above.
2. **CJ's Events Warwickshire:** find why renewal selection stopped after 25 Oct 22:54Z, for example exhausted retry state, a selection predicate, or a domain window.
3. Review retry scheduling, backoff and any circuit-breaker per host. Propose correct behaviour: bounded attempts, per-host cooldown, and no evidence writes for unchanged or failed fetches.
4. List the opportunities that can safely return to customer search once source validity is re-established through the normal verifier. **Don't bypass source protections, use unapproved fetch routes, or expose unverified records.**

## P1: SEO branch review

Review `findpitches-v3/seo-launch-fixes` at `eba33da9` (bundle `claude-20261113-seo-launch-fixes.bundle` on Chris's PC until pushed).

1. **Validate:**
   - robots rules (`PUBLIC_RENDER_API`, Google longest-match semantics);
   - canonical links (`routes.href.*`);
   - 301s for `/seo.html?path=` and `/opportunity.html?id=`, including the open-redirect guard;
   - server-rendered content (`customer-ssr.mjs`);
   - live-market-only robots and sitemap;
   - Free-tier redaction everywhere.
2. Confirm that Stripe, subscriptions, entitlements and the seven-day trial are untouched. No billing code changed.
3. **Review the catalogue changes** in `customer-catalogue.mjs`:
   - single-flight per scope is always on;
   - `V3_CATALOGUE_CACHE_SECONDS` is off by default, capped at 60 seconds, and runs `mapProof` per request.
   - Recommend a safe initial value. Claude suggests 30 seconds, after a baseline is taken.
4. **Check the tests are meaningful.**
   - The new `customer-seo-launch.test.mjs` passes 10/10.
   - Of the 596 V3 tests, 593 pass. The 3 failures are the native-D1/workerd tests: "native D1 commits the reviewed official proof…", "real workerd D1 executes all migrations…" and "native D1 accepts the bounded central reservation SQL…". They fail identically on base `45f6a541` in Claude's environment. Document their cause and confirm they pass in yours.
   - One existing assertion was changed (legacy listing URL → 301).

## P1: production stability

1. Use Cloudflare logs and analytics to break the 503s down by cause:
   - D1 errors or timeouts in `findpitches-v3-api-shadow`;
   - customer Worker errors;
   - the 120 s `as_of` guard;
   - rate limits (429, `customer_rate_limits`);
   - Cloudflare security challenges or bot rules.
2. Propose a materialised catalogue: a cron or queue that builds the validated customer snapshot every 1–2 minutes into R2 or KV with a version and `as_of`. Page views then read that and never hit the shadow D1. Cover freshness guarantees, failure mode (fail closed with a bounded age), and how it interacts with this branch's single-flight and cache.
3. **Before any deployment, set a baseline:**
   - p50 and p95 latency for `/`, `/uk/`, a region page and a listing;
   - API Worker CPU and D1 duration;
   - 503 rate per day;
   - row reads per page view.

## P2: search-result accuracy

1. **US:** about 804 distinct event-dates across 1,157 listings. 194 events carry 2–7 separate per-category application routes, mostly Eventeny forms. Recommend grouping by event while keeping each route (label from `application_heading`), and advertise event counts.
2. Correct unsupported coverage claims: homepage "coverage building in … Ireland, Singapore, Hong Kong" (0 listings), and sports promotion while the sports type count is 0.
3. Keep unlaunched markets out of the sitemap. The branch already does this; keep it so.

## Return to Chris and Claude

- The database growth root cause, with the table-level evidence.
- Immediate risk-reduction options, ranked, with GB reclaimed and days gained, risk, tests and rollback.
- Renewal root causes and the list of records that can be recovered.
- SEO branch review findings: accept, change or reject, item by item.
- A recommended deployment sequence. Claude's proposal for you to challenge:
  1. capacity relief (approved reclaim);
  2. baseline metrics;
  3. SEO branch, with the cache decided;
  4. renewal fixes;
  5. materialised catalogue;
  6. count and copy corrections;
  7. Google Search Console submission.
