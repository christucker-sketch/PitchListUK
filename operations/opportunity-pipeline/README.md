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
PITCHLIST_PIPELINE_RUNTIME_DIR=/absolute/path/outside/git node scripts/health-check.js
```

The apply command also requires a securely injected `SERPER_API_KEY`. Never put secret values on a command line or in Git. The run budget is deliberately non-secret and should match the maximum number of planned queries.

## Cron safety change (21 August 2026)

The existing system crontab is preserved and still starts `/home/ct_admin/.openclaw/workspace/pitchlist-uk/scripts/cron-database-cycle.sh` at `03:17` daily. That operational script still runs discovery with `npm run database:grow -- --apply`, but the former next line:

```sh
npm run database:publish-customer-ready
```

is replaced by an explicit `automatic_publish_paused` log entry. No other scheduled PitchList process can publish or deploy opportunity data. To restore publishing later, review the safe-publisher PR, deploy its controlled scheduler entry, and remove the pause only after a successful dry-run and explicit production approval. Do not simply reinsert the old command: it targeted a stale/dirty checkout and lacked review, SHA, diff, security-header and rollback gates.

## Source approval

`config/sources.js` is the source registry. Each approved source states jurisdiction, robots handling, terms-policy basis, minimum request interval and concurrency. New sources require a reviewed registry change before fetching. Republic-of-Ireland lanes remain exported only for historical report interpretation and cannot be selected or scheduled.

## Monitoring

`lib/monitoring.js` produces deterministic alert records for discovery/publish failure, credit pressure, stale production data, zero promoted growth, non-UK or expired records, broken application links, geographic regression, missing security headers and production/GitHub SHA mismatch. Notification transport remains an external operational concern; this code never contacts customers or third parties.
