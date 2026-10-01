# UK Cloudflare Acquisition Migration Plan

## Objective

Move PitchList UK acquisition from Hal/local runtime execution into the same Cloudflare-hosted acquisition architecture now used by FindPitches US, without changing live UK customer behaviour until equivalence is proven.

The target is not a second bespoke UK Worker. The target is one shared Cloudflare acquisition engine with country adapters/configuration, while Hal remains reviewer/operator rather than the machine doing discovery, fetch, staging and publication logic.

## Current UK architecture: what is still local/Hal-dependent

### 1. Runtime filesystem is part of the execution model

The UK pipeline currently requires `PITCHLIST_PIPELINE_RUNTIME_DIR` to be an absolute directory outside the Git checkout. Growth, staging manifests, approved-source check state and run reports are persisted to local disk.

Key dependency:

- `operations/opportunity-pipeline/lib/staging-store.js`
  - `runtimeRoot()` rejects a runtime path inside Git.
  - staging/report state is written with synchronous filesystem operations.

Implication: Cloudflare cannot lift-and-shift these scripts unchanged. Durable run state must become Workflow step output, repository data, or a Cloudflare-native state store rather than a local directory.

### 2. UK growth orchestration is a Node subprocess chain

`operations/opportunity-pipeline/scripts/grow-database.js` currently orchestrates work by spawning Node scripts:

1. select UK acquisition lanes;
2. run `acquire-events.js` for bounded search discovery;
3. run `clean-staged-events.js`;
4. run `refresh-active-events.js`;
5. run freshness checks;
6. run area enrichment;
7. run quality enrichment;
8. write local growth reports.

The script also depends on local process environment, filesystem reports and subprocess exit codes.

Implication: orchestration should be replaced by Workflow steps calling shared pure/core functions. Do not attempt to run the existing CLI orchestrator inside Cloudflare.

### 3. UK discovery configuration is already separable and reusable

The UK search strategy is expressed as lane configuration in:

- `operations/opportunity-pipeline/acquisition/lanes.js`

This contains UK-specific geography, vocabulary and query families such as council street trading, Christmas markets, county shows, food festivals, artisan markets and approved-source network expansion.

This is a good migration boundary: preserve the query packs as UK country configuration while moving execution into the shared Cloudflare discovery engine.

### 4. Approved UK direct-source polling is already strongly bounded

`operations/opportunity-pipeline/scripts/fetch-approved-sources.js` already has useful production-safe behaviour:

- only approved/terms-reviewed sources;
- recommended polling intervals;
- bounded concurrency;
- same-host relevant-link following;
- fetch policy enforcement;
- zero Serper credits for direct polling;
- validation before staging;
- explicit `production_write_enabled: false` in the run report.

The source registry in `operations/opportunity-pipeline/config/sources.js` also carries much of the data needed by Cloudflare: organisation, source type, geographic coverage, opportunity type, application route, recurring flag, polling interval and source path prefix.

Implication: direct-source polling should be the first UK Cloudflare canary because it is deterministic, bounded and does not require search credits.

### 5. UK publication is still local-git/deploy coupled

`scripts/publish-reviewed-opportunities.js` currently:

- fetches `origin/main` locally;
- validates local branch/head/worktree state;
- reads a local reviewed manifest;
- writes `functions/_data/opportunities.mjs` locally;
- builds/tests generated assets locally;
- commits directly to local Git;
- pushes `main`;
- deploys Pages;
- verifies deployed SHA/live headers;
- writes a local publish receipt.

This is deliberately much more permissive than the newer US PR-based publication flow because it is trusted local automation.

Implication: UK Cloudflare migration must NOT reproduce direct-to-main publication. Publication should adopt the US model: Cloudflare creates deterministic additions-only PRs, GitHub CI is the gate, and a controller/reviewer merges and deploys after verification.

## Current US Cloudflare architecture to reuse

The production US Worker/Workflow already provides the desired primitives:

- Cloudflare Workflow execution with retryable steps;
- reads current `main` and snapshot directly through GitHub API;
- deterministic branch names tied to exact main SHA;
- fail-closed `assertMainUnchanged` before publication;
- source-growth PRs and data PRs rather than direct writes to main;
- deterministic evidence receipt accounting;
- additions-only source publication;
- per-state adapters/config;
- compact Workflow result returned to the external controller;
- GitHub CI remains the publication gate;
- no automatic merge or deploy from the Worker.

The current Worker name and folder remain Texas-labelled for historical reasons, but the implementation is already multi-state. Do not rename infrastructure as part of the UK migration.

## Target UK architecture

### Country adapter

Introduce a UK country acquisition adapter with a stable contract parallel to the US state adapter.

Minimum country config:

- country code: `GB` / public market key `UK`;
- locale: `en-GB`;
- currency: `GBP`;
- date semantics: DD/MM/YYYY for presentation, ISO internally;
- geography: nation / region / county / locality / postcode;
- vocabulary: trader, stallholder, pitch, market, street trading, exhibitor, caterer;
- approved source routes;
- discovery query lanes;
- dedupe/identity rules;
- snapshot path: `functions/_data/opportunities.mjs`;
- source registry location;
- evidence requirements.

### Shared Workflow modes

The shared Cloudflare engine should support UK equivalents of the US modes:

1. `discover` — bounded search discovery from UK lane/query configuration;
2. `poll` or `acquire` — fetch approved UK routes and extract candidate opportunities;
3. `publish-source-pr` — additions-only approved-source PR with deterministic evidence;
4. `publish-data-pr` — additions-only UK opportunity snapshot PR with evidence receipt count matching reviewed additions.

The engine should be country-neutral internally. UK-specific semantics belong in config/adapters, not duplicated control flow.

### State/checkpoint model

Replace local runtime files with explicit Workflow/controller state.

Required checkpoint fields:

- country;
- lane/query cursor;
- approved-source polling cursor/checkpoint;
- Workflow instance ID;
- exact worker version/SHA;
- exact repository base SHA;
- source PR/data PR number;
- evidence receipt counts;
- additions/held/rejected counts and reasons;
- deferred unit queue;
- genuine blockers;
- production snapshot count before/after;
- deployment SHA after merge.

Use the resilience model already proven by the US controller: uncertain/transient infrastructure failures retain the checkpoint rather than guessing or replaying blindly.

## Migration phases

### UKCF-001 — Extract UK pure-core contracts

Goal: make existing UK logic callable without filesystem/CLI/process assumptions.

Work:

- extract UK query selection from CLI orchestration into pure functions;
- extract direct approved-source polling core from `fetch-approved-sources.js`;
- isolate extraction/validation/dedupe logic from file IO;
- define a normalized UK compact result contract;
- add deterministic tests using fixture HTML/data.

No Cloudflare deployment. No production behaviour change.

Exit gate:

- existing local UK tests remain green;
- new pure-core tests prove equivalent results from fixed fixtures;
- no changes to `functions/_data/opportunities.mjs`.

### UKCF-002 — Shared country acquisition contract

Goal: add country-aware configuration/adapters alongside the existing US implementation.

Work:

- introduce shared acquisition country contract;
- add UK adapter/config;
- keep US behaviour byte-for-byte/semantically unchanged;
- add contract tests proving US and UK cannot leak geography/currency/vocabulary into each other.

Exit gate:

- US Worker compile/tests green;
- active US growth controller unaffected;
- UK adapter can produce bounded plans without executing network calls.

### UKCF-003 — Cloudflare UK direct-source canary

Goal: run a no-search, no-publication Cloudflare canary against a small approved UK route set.

Initial canary recommendation:

- 3-5 established first-party routes;
- mix of council + market/event operator;
- zero Serper use;
- compact Workflow output only;
- no source/data PR creation initially.

Compare Cloudflare output against the existing local direct-source fetcher on the same routes and date.

Required comparison:

- pages attempted/fetched;
- extraction identities;
- accepted/rejected rows;
- rejection reasons;
- application routes;
- recurring/event dates/deadlines;
- evidence receipts.

Exit gate:

- no unexplained identity difference;
- no weaker evidence acceptance than local path;
- repeatable Workflow result;
- transient failure retry behaviour proven.

### UKCF-004 — Cloudflare UK discovery canary

Goal: move bounded Serper/search discovery into Cloudflare for one or two UK lanes.

Start with high-signal lanes rather than broad national search, for example:

- council street trading;
- approved-source network expansion;
- one geographically constrained lane.

Controls:

- explicit credit budget per run;
- query cursor/checkpoint;
- first-party/approved-domain preference;
- bounded fetch count;
- no automatic source approval;
- deterministic evidence before source PR generation.

Exit gate:

- credit accounting exact;
- source candidates reproduce/beat local quality;
- duplicates suppressed;
- every proposed source has one exact evidence receipt.

### UKCF-005 — Source PR publication

Goal: enable Cloudflare to create additions-only UK approved-source PRs.

Adopt US safety contracts:

- exact main SHA in branch identity;
- fail if main moved;
- one deterministic receipt per net-new source;
- PR changes source registry only;
- no source removals;
- no auto merge;
- CI required before merge.

During this phase Hal/local remains the reviewer/merger.

Exit gate:

- several successful source PR cycles;
- no false source count/evidence mismatches;
- replay/idempotency proven.

### UKCF-006 — Data PR publication

Goal: create UK opportunity snapshot PRs from Cloudflare-reviewed acquisition output.

Controls:

- additions-only initially;
- exact before/after count;
- exact opportunity identities in Workflow output;
- no hidden modification of existing rows;
- deterministic reviewed-row evidence;
- PR changes only approved UK snapshot/generated files as explicitly allowed;
- GitHub CI gate;
- no Worker-side merge/deploy.

Exit gate:

- repeated PRs merge cleanly;
- production deployment SHA verified;
- live PitchList UK API/site count matches merged snapshot.

### UKCF-007 — Shadow recurring operation

Goal: run Cloudflare UK acquisition on the intended production cadence while leaving current local/Hal UK acquisition disabled for publication but available for comparison.

For a fixed observation window, compare:

- opportunities found;
- source discoveries;
- held/rejected reasons;
- false positives;
- missed known routes;
- credit use;
- run duration;
- transient failure recovery.

Important: never let both paths publish the same acquisition cycle.

Exit gate:

- Cloudflare output is at least equivalent in quality;
- no unexplained misses;
- checkpoint/replay behaviour stable;
- operator reporting/Telegram alerts working.

### UKCF-008 — Cut acquisition execution away from Hal

Goal: make Cloudflare the authoritative UK acquisition executor.

Cutover:

- disable local UK acquisition cron/service;
- preserve local scripts for rollback during an agreed safety window;
- Cloudflare becomes authoritative for discovery/fetch/staging/PR generation;
- Hal remains controller/reviewer/merge/deploy/Telegram operator as required.

Do not remove local tooling yet.

Exit gate:

- several successful unattended production cycles;
- no local-runtime dependency required for ordinary UK growth;
- complete checkpoint/report available independently of Hal filesystem.

### UKCF-009 — Neutralise shared infrastructure

Only after both US and UK are stable on the shared engine:

- move implementation from the historical `cloudflare-texas-acquisition` naming toward neutral shared acquisition naming;
- neutralise binding/class names;
- do not combine the rename with behaviour changes.

This is cosmetic/operational cleanup, not a migration prerequisite.

## What should remain country-specific

Do not force UK semantics into US structures where they do not fit.

Keep UK-specific adapters for:

- postcode parsing/search;
- counties/regions/nations;
- UK locality normalization;
- GBP;
- trader/stallholder/pitch terminology;
- council street trading semantics;
- DD/MM/YYYY presentation;
- UK query families and source allowlists.

Shared logic should cover:

- fetch/retry policy;
- evidence receipts;
- search budget accounting;
- HTML/text extraction plumbing;
- deterministic identity/dedupe framework;
- PR branch/base safety;
- additions-only publication contracts;
- Workflow checkpoint/result schema;
- deferred/replay resilience;
- operational status/reporting.

## Rollback strategy

At every phase before UKCF-008, rollback is simply disabling the UK Cloudflare trigger because the current local pipeline remains authoritative.

After UKCF-008:

1. stop/disable UK Cloudflare recurring trigger;
2. verify no Workflow instance is queued/running;
3. confirm repository `main` and UK production snapshot are clean/current;
4. re-enable the preserved local UK schedule at the last known safe configuration;
5. do not replay any Cloudflare unit whose publication status is uncertain until its GitHub/Workflow state is reconciled.

No rollback step should delete source/opportunity history automatically.

## Operational reporting required before cutover

The UK Cloudflare controller/status output should expose at minimum:

- controller status;
- current lane/query offset;
- active Workflow ID;
- Worker version/SHA;
- UK opportunity count;
- approved-source count;
- last successful source/data PR + merged SHA;
- last deployment SHA;
- deferred units;
- blockers;
- credits consumed in current/last cycle;
- next lane/unit.

Telegram should reuse the existing OpenClaw notification transport so US and UK alerts arrive through the same operational channel with an explicit market label.

## Recommended implementation order from here

1. Finish/merge the current US quality-audit work independently.
2. Build UKCF-001 pure-core extraction without deploying anything.
3. Build UKCF-002 shared country contract while preserving all current US behaviour.
4. Deploy UKCF-003 direct-source canary only.
5. Validate parity before enabling any search discovery.
6. Add discovery canary and evidence-gated source PRs.
7. Add UK data PR generation.
8. Shadow recurring operation.
9. Cut local UK acquisition only after equivalence is proven.

## Definition of done

The migration is complete when:

- ordinary UK discovery and direct-source polling run in Cloudflare rather than on Hal;
- all acquisition progress is checkpointed independently of Hal local disk;
- source/data changes arrive as deterministic evidence-gated PRs;
- GitHub CI remains the publication gate;
- no UK acquisition run writes directly to `main`;
- Hal can disappear/reboot without losing acquisition state;
- UK-specific postcode/geography/date/vocabulary behaviour remains correct;
- US acquisition continues unchanged on the shared engine;
- operator status and Telegram reporting cover both markets.