# Opportunity acquisition and staging

This directory is the version-controlled implementation of PitchListUK opportunity discovery. It searches configured UK lanes, fetches only approved sources under explicit robots/terms policies, extracts evidence, classifies records, and writes review artifacts to external runtime storage. It has no production publisher, Cloudflare command, Git push, or public-data export.

## Safety model

- `PITCHLIST_PIPELINE_RUNTIME_DIR` must be an absolute operational path outside this repository. On Hal it remains `/home/ct_admin/.openclaw/workspace/pitchlist-uk`.
- `SERPER_API_KEY` is supplied by the process environment. Secrets and `.env` files are never read from or stored in this repository.
- `PITCHLIST_SERPER_RUN_BUDGET` is a mandatory hard cap when an account balance is unavailable. If `SERPER_CREDITS_REMAINING` is also supplied, the account reserve must pass independently. The aggregate nightly entry point checks the complete selected-query cost before starting any lane.
- Search results from unapproved sources are recorded as classified failures and are not fetched or promoted.
- Only `quality_status=customer_ready` plus `publishable=true` enters the local customer-ready staging CSV. `review`, `needs_work`, and `rejected` remain in the review manifest.
- The operational refresh updates only the external local active/archive files. It cannot write `functions/_data/opportunities.mjs`, generate area pages, invoke Git, or deploy Cloudflare Pages.

## Commands

From this directory:

```sh
npm test
node scripts/grow-database.js --dry-run --all
PITCHLIST_PIPELINE_RUNTIME_DIR=/absolute/path/outside/git PITCHLIST_SERPER_RUN_BUDGET=8 node scripts/grow-database.js --apply --max-lanes 8 --query-limit 1
PITCHLIST_PIPELINE_RUNTIME_DIR=/absolute/path/outside/git node scripts/fetch-approved-sources.js --force
PITCHLIST_PIPELINE_RUNTIME_DIR=/absolute/path/outside/git PITCHLIST_SERPER_RUN_BUDGET=12 node scripts/discover-source-candidates.js --apply
PITCHLIST_PIPELINE_RUNTIME_DIR=/absolute/path/outside/git node scripts/build-source-promotion-manifest.js --registry data/source-candidates/registry.json --output data/source-candidates/promotion.json --reviewed-commit "$REVIEWED_SHA" --reviewer "$REVIEWER"
node scripts/apply-source-promotion-manifest.js /absolute/runtime/data/source-candidates/promotion.json
PITCHLIST_PIPELINE_RUNTIME_DIR=/absolute/path/outside/git node scripts/health-check.js
```

The apply command also requires a securely injected `SERPER_API_KEY`. Never put secret values on a command line or in Git. The run budget is deliberately non-secret and should match the maximum number of planned queries.

## Cron safety change (21 August 2026)

The existing system crontab is preserved and still starts `/home/ct_admin/.openclaw/workspace/pitchlist-uk/scripts/cron-database-cycle.sh` at `03:17` daily. That operational script runs the version-controlled `scripts/grow-database.js` from the clean canonical checkout with runtime data and credentials held in the external operational directory. The former production step:

```sh
npm run database:publish-customer-ready
```

is replaced by an explicit `automatic_publish_paused` log entry. No other scheduled PitchList process can publish or deploy opportunity data. To restore publishing later, review the safe-publisher PR, deploy its controlled scheduler entry, and remove the pause only after a successful dry-run and explicit production approval. Do not simply reinsert the old command: it targeted a stale/dirty checkout and lacked review, SHA, diff, security-header and rollback gates.

## Source approval

`config/sources.js` is the source registry. Each approved source states jurisdiction, robots handling, terms-policy basis, minimum request interval and concurrency. New sources require a reviewed registry change before fetching. Republic-of-Ireland lanes remain exported only for historical report interpretation and cannot be selected or scheduled.

For recurring first-party sources the registry also records the owner, geographic coverage, opportunity type, official application/contact route, recurrence, last successful discovery placeholder, observed yield placeholder and recommended polling interval. Each staging run records actual per-source yield, last successful discovery and rejection reasons in its external runtime report. Runtime metrics are deliberately excluded from Git.

The `weak-regions-first-party-applications` lane targets exact official routes rather than generic licence searches. Its reviewed sources currently cover County Durham, Tyne and Wear, Northumberland, Cumbria, South Yorkshire, Dorset and Buckinghamshire. Search-result provenance and classified fetch outcomes are retained in the external acquisition report so a zero-yield lane can be diagnosed without repeating Serper queries.

### Source-onboarding factory

New-domain discovery is a separate bounded workflow. It rotates precise organiser-by-organiser queries across every UK region, retrieves at most 50 candidate pages per normal batch, obeys robots, rejects non-HTTPS/private-network targets and stores evidence in the external candidate registry. Discovery never writes production data or the approved registry.

Candidates retain their canonical host and route, organisation, geography, opportunity type, query provenance, first-party and trader-application evidence, robots/terms/fetch results, rejection reason, review decision, recheck date and observed yield. Unchanged decisions are not rediscovered until their recheck date.

Deterministic classifications are:

- `auto-approvable-first-party` for an unambiguous UK public-service route with an actual trader opportunity;
- `manual-review-required` for private organisers and incomplete public-service metadata;
- explicit aggregator, licence-only, no-live-route, foreign, duplicate, policy and fetch-failure outcomes.

Auto-approvable means eligible for a reviewed source manifest; it does not mean published. Promotion is addition-only and bound to the reviewed commit, reviewer, exact route/path scope, evidence hashes, manifest hash and expected registry count. Private sources need an explicit reviewer decision. `approved-source-routes.json` contains only successfully applied reviewed manifests and automatic removal remains impossible.

## Promotion operating model

- Approved first-party routes are checked directly at their configured 14- or 30-day cadence; Serper is reserved for bounded new-domain/page discovery.
- Automatic additions are permitted only from an exact registry route after direct retrieval, live-link, UK, open-opportunity, date/currentness, organiser, location, evidence and duplicate gates all pass. Releases use configurable absolute, percentage-growth, per-source and duplicate-rate caps and produce an addition-only manifest.
- A new domain, source-route change, ambiguous date/status change or proposed removal always requires manual review. Automatic manifests cannot update or remove rows.
- Foreign, expired, closed, duplicated and weak-evidence rows are automatically rejected or quarantined and never promoted to customer-ready staging.
- The automatic publisher still requires clean canonical `main`, exact `origin/main`, complete site and pipeline tests, data/generated-only diffs, security-header parity, a successful Git push and the hardened Cloudflare wrapper. It records deployment and rollback metadata.
- Alerts cover stale production data, zero valid growth, the 100-source/400-listing/20-net-additions targets, candidate backlog, review backlog, zero-yield sources, source failures and weak-region coverage regression. A source with repeated zero yield or policy ambiguity is removed from automatic polling pending review.

## Monitoring

`lib/monitoring.js` produces deterministic alert records for discovery/publish failure, credit pressure, stale production data, zero promoted growth, non-UK or expired records, broken application links, geographic regression, missing security headers and production/GitHub SHA mismatch. Notification transport remains an external operational concern; this code never contacts customers or third parties.
