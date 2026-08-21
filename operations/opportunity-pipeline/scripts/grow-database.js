#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { selectLanes, LANES } = require('../acquisition/lanes');
const { searchOpportunities, freshnessReviewQueue } = require('../lib/opportunity-database');
const { runtimeRoot, atomicWriteJson } = require('../lib/staging-store');
const { preflightFromEnv } = require('../lib/credit-budget');
const { hostname, sourceRuleFor } = require('../config/sources');

const CODE_ROOT = path.resolve(__dirname, '..');
const APP = process.env.PITCHLIST_PIPELINE_RUNTIME_DIR ? runtimeRoot() : CODE_ROOT;
const REPORT_DIR = path.join(APP, 'data', 'growth');

function bool(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseArgs(argv) {
  const out = {
    apply: false,
    list: false,
    laneIds: [],
    maxLanes: Number(process.env.PITCHLIST_GROW_MAX_LANES || 3),
    queryLimit: Number(process.env.PITCHLIST_GROW_QUERY_LIMIT_PER_LANE || 4),
    searchNum: Number(process.env.PITCHLIST_GROW_SEARCH_NUM || 8),
    maxFetch: Number(process.env.PITCHLIST_GROW_MAX_FETCH_PER_LANE || 35),
    freshnessLimit: Number(process.env.PITCHLIST_GROW_FRESHNESS_LIMIT || 120),
    skipAcquire: bool(process.env.PITCHLIST_GROW_SKIP_ACQUIRE, false)
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') out.apply = true;
    else if (arg === '--dry-run') out.apply = false;
    else if (arg === '--list') out.list = true;
    else if (arg === '--all') out.maxLanes = LANES.length;
    else if (arg === '--lane') out.laneIds.push(argv[++i] || '');
    else if (arg === '--max-lanes') out.maxLanes = Number(argv[++i] || out.maxLanes);
    else if (arg === '--query-limit') out.queryLimit = Number(argv[++i] || out.queryLimit);
    else if (arg === '--search-num') out.searchNum = Number(argv[++i] || out.searchNum);
    else if (arg === '--max-fetch') out.maxFetch = Number(argv[++i] || out.maxFetch);
    else if (arg === '--freshness-limit') out.freshnessLimit = Number(argv[++i] || out.freshnessLimit);
    else if (arg === '--skip-acquire') out.skipAcquire = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
  }
  out.laneIds = out.laneIds.filter(Boolean);
  return out;
}

function help() {
  console.log(`Usage: node scripts/grow-database.js [--dry-run|--apply] [--lane ID ...] [--max-lanes 3] [--query-limit 4] [--search-num 8] [--max-fetch 35] [--freshness-limit 120]

Default mode is --dry-run: prints selected lanes and writes no data.
Use --apply to run bounded lane acquisition, clean/import rows, recheck freshness and enrich areas.
Use --list to show lane IDs.

Environment caps:
  PITCHLIST_GROW_MAX_LANES=3
  PITCHLIST_GROW_QUERY_LIMIT_PER_LANE=4
  PITCHLIST_GROW_SEARCH_NUM=8
  PITCHLIST_GROW_MAX_FETCH_PER_LANE=35
  PITCHLIST_GROW_FRESHNESS_LIMIT=120`);
}

function runNode(script, args = [], options = {}) {
  const absoluteScript = path.resolve(CODE_ROOT, script);
  const result = spawnSync(process.execPath, [absoluteScript, ...args], {
    cwd: CODE_ROOT,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20
  });
  return {
    command: `node ${script} ${args.join(' ')}`.trim(),
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function parseJsonFromOutput(output, label) {
  const trimmed = String(output || '').trim();
  const end = trimmed.lastIndexOf('}');
  if (end < 0) throw new Error(`Could not parse JSON from ${label}`);
  for (let start = trimmed.indexOf('{'); start >= 0 && start < end; start = trimmed.indexOf('{', start + 1)) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch (_) {
      // dotenvx can print advisory snippets containing braces before command JSON.
    }
  }
  throw new Error(`Could not parse JSON from ${label}`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(APP, file), 'utf8'));
}

function dailyQueryOffset(lane) {
  const forced = process.env.PITCHLIST_GROW_QUERY_OFFSET;
  if (forced !== undefined && forced !== '') return Number(forced) || 0;
  const day = Math.floor(Date.now() / 86400000);
  const seed = String(lane.id || '').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return day + seed;
}

function selectQueries(lane, limit) {
  const queries = Array.isArray(lane.queries) ? lane.queries.filter(Boolean) : [];
  const count = Math.min(Math.max(Number(limit) || 1, 1), queries.length);
  if (!queries.length) return [];
  const offset = dailyQueryOffset(lane) % queries.length;
  return Array.from({ length: count }, (_, index) => queries[(offset + index) % queries.length]);
}

function stats() {
  const all = searchOpportunities(APP, { audience: 'customer', limit: 250 });
  const food = searchOpportunities(APP, { audience: 'customer', category: 'food', limit: 250 });
  const craft = searchOpportunities(APP, { audience: 'customer', category: 'craft', limit: 250 });
  const london = searchOpportunities(APP, { audience: 'customer', county: 'London', limit: 250 });
  const southEast = searchOpportunities(APP, { audience: 'customer', county: 'South East', limit: 250 });
  const queue = freshnessReviewQueue(APP, { limit: 1 });
  return {
    active_rows: all.total,
    customer_rows: all.count,
    customer_food_rows: food.count,
    customer_craft_rows: craft.count,
    london_rows: london.count,
    south_east_rows: southEast.count,
    fresh: queue.summary.fresh,
    aging: queue.summary.aging,
    stale: queue.summary.stale,
    unknown: queue.summary.unknown,
    needs_review: queue.needs_review,
    area_facets: all.facets.counties.length
  };
}

function runLane(lane, options) {
  const queries = selectQueries(lane, options.queryLimit);
  const acquisition = runNode('scripts/acquire-events.js', queries, {
    env: {
      PITCHLIST_ACQUIRE_QUERY_LIMIT: String(options.queryLimit),
      PITCHLIST_ACQUIRE_SEARCH_NUM: String(options.searchNum),
      PITCHLIST_ACQUIRE_MAX_FETCH: String(options.maxFetch),
      PITCHLIST_QUERY_LANE: lane.id
    }
  });
  if (acquisition.status !== 0 && acquisition.status !== 2) {
    throw new Error(`${lane.id} acquisition failed: ${acquisition.stderr || acquisition.stdout}`);
  }
  const acquisitionSummary = parseJsonFromOutput(acquisition.stdout, `${lane.id} acquisition`);
  const acquisitionReport = readJson(acquisitionSummary.reportPath);

  const clean = runNode('scripts/clean-staged-events.js', [acquisitionSummary.csvPath]);
  if (clean.status !== 0) throw new Error(`${lane.id} clean failed: ${clean.stderr || clean.stdout}`);
  const cleanSummary = parseJsonFromOutput(clean.stdout, `${lane.id} clean`);
  const reviewedRecords = cleanSummary.output_json ? (readJson(cleanSummary.output_json).records || []) : [];
  const sourceMetrics = Object.values(reviewedRecords.reduce((metrics, row) => {
    const host = hostname(row.source_url) || 'invalid';
    const rule = sourceRuleFor(row.source_url);
    const metric = metrics[host] || {
      source_owner: rule.organisation || '', domain: host,
      geographic_coverage: rule.geographic_coverage || row.region || '',
      opportunity_type: rule.opportunity_type || '',
      official_application_route: rule.official_application_route || '',
      recurring: rule.recurring === true,
      robots_policy: rule.robots_policy,
      terms_policy: rule.terms_policy,
      recommended_polling_days: rule.recommended_polling_days || 30,
      last_successful_discovery: null,
      fetched: 0, customer_ready: 0, review: 0, needs_work: 0, rejected: 0,
      rejection_reasons: {}
    };
    metric.fetched++;
    metric[row.quality_status] = (metric[row.quality_status] || 0) + 1;
    if (row.quality_status === 'customer_ready') metric.last_successful_discovery = new Date().toISOString();
    for (const reason of row.quality_reasons || []) metric.rejection_reasons[reason] = (metric.rejection_reasons[reason] || 0) + 1;
    metrics[host] = metric;
    return metrics;
  }, {}));

  const refresh = runNode('scripts/refresh-active-events.js', [cleanSummary.output_csv]);
  if (refresh.status !== 0) throw new Error(`${lane.id} refresh failed: ${refresh.stderr || refresh.stdout}`);
  const refreshSummary = parseJsonFromOutput(refresh.stdout, `${lane.id} refresh`);

  return {
    lane_id: lane.id,
    title: lane.title,
    category: lane.category,
    queries,
    acquisition: {
      candidates: acquisitionReport.candidates,
      rows: acquisitionSummary.rows,
      validation_errors: acquisitionSummary.validationErrors,
      quarantined_rows: acquisitionSummary.quarantinedRows,
      report_file: acquisitionSummary.reportPath,
      csv_file: acquisitionSummary.csvPath,
      candidate_outcomes: acquisitionReport.candidate_outcomes || []
    },
    clean: {
      input_rows: cleanSummary.input_rows,
      accepted_rows: cleanSummary.accepted_rows,
      rejected_rows: cleanSummary.rejected_rows,
      report_file: cleanSummary.output_json ? cleanSummary.output_json.replace(/\.json$/, '.report.json') : '',
      csv_file: cleanSummary.output_csv,
      top_reject_reasons: cleanSummary.top_reject_reasons || {}
    },
    source_metrics: sourceMetrics,
    refresh: {
      incoming_rows: refreshSummary.incoming_rows,
      added: refreshSummary.added,
      updated: refreshSummary.updated,
      active_rows: refreshSummary.active_rows,
      expired_this_run: refreshSummary.expired_this_run
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return help();
  if (options.list) {
    console.log(JSON.stringify(LANES.map(({ id, title, category, priority, queries }) => ({
      id,
      title,
      category,
      priority,
      queries: queries.length
    })), null, 2));
    return;
  }

  const lanes = selectLanes(options.laneIds, options.maxLanes);
  if (!options.apply) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      selected_lanes: lanes.map(lane => ({
        id: lane.id,
        title: lane.title,
        category: lane.category,
        priority: lane.priority,
        planned_queries: selectQueries(lane, options.queryLimit)
      })),
      caps: {
        max_lanes: options.maxLanes,
        query_limit_per_lane: options.queryLimit,
        search_num: options.searchNum,
        max_fetch_per_lane: options.maxFetch,
        freshness_limit: options.freshnessLimit
      },
      note: 'Use --apply to run acquisition/import/freshness/enrichment.'
    }, null, 2));
    return;
  }

  if (!process.env.PITCHLIST_PIPELINE_RUNTIME_DIR) {
    throw new Error('PITCHLIST_PIPELINE_RUNTIME_DIR is required for --apply; production writes are not supported');
  }

  const plannedQueries = lanes.reduce((total, lane) => total + selectQueries(lane, options.queryLimit).length, 0);
  const creditPreflight = options.skipAcquire ? null : preflightFromEnv(plannedQueries);
  if (creditPreflight && !creditPreflight.allowed) {
    throw new Error(`Serper run preflight blocked acquisition: ${creditPreflight.reason}`);
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const before = stats();
  const laneResults = [];
  const failures = [];

  if (!options.skipAcquire) {
    for (const lane of lanes) {
      try {
        laneResults.push(runLane(lane, options));
      } catch (err) {
        failures.push({ lane_id: lane.id, error: err.message });
      }
    }
  }

  const freshness = runNode('scripts/recheck-freshness.js', ['--apply', '--limit', String(options.freshnessLimit)]);
  const freshnessSummary = freshness.status === 0 || freshness.status === 2
    ? parseJsonFromOutput(freshness.stdout, 'freshness')
    : { error: freshness.stderr || freshness.stdout, status: freshness.status };

  const enrichment = runNode('scripts/enrich-active-areas.js', ['--apply']);
  const enrichmentSummary = enrichment.status === 0
    ? parseJsonFromOutput(enrichment.stdout, 'area enrichment')
    : { error: enrichment.stderr || enrichment.stdout, status: enrichment.status };

  const quality = runNode('scripts/enrich-active-quality.js', ['--apply']);
  const qualitySummary = quality.status === 0
    ? parseJsonFromOutput(quality.stdout, 'quality enrichment')
    : { error: quality.stderr || quality.stdout, status: quality.status };

  for (const [step, result] of [['freshness', freshness], ['area_enrichment', enrichment], ['quality_enrichment', quality]]) {
    if (result.status !== 0) failures.push({ step, error: `maintenance subprocess exited ${result.status}` });
  }

  const after = stats();
  const reportFile = path.join(REPORT_DIR, `database-growth-${stamp}.json`);
  const report = {
    generated_at: new Date().toISOString(),
    mode: 'apply',
    caps: {
      max_lanes: options.maxLanes,
      query_limit_per_lane: options.queryLimit,
      search_num: options.searchNum,
      max_fetch_per_lane: options.maxFetch,
      freshness_limit: options.freshnessLimit,
      skip_acquire: options.skipAcquire
    },
    credit_preflight: creditPreflight,
    lanes: laneResults,
    failures,
    maintenance: {
      freshness: freshnessSummary,
      area_enrichment: enrichmentSummary,
      quality_enrichment: qualitySummary
    },
    before,
    after,
    delta: {
      active_rows: after.active_rows - before.active_rows,
      customer_rows: after.customer_rows - before.customer_rows,
      customer_food_rows: after.customer_food_rows - before.customer_food_rows,
      customer_craft_rows: after.customer_craft_rows - before.customer_craft_rows,
      needs_review: after.needs_review - before.needs_review
    }
  };
  atomicWriteJson(reportFile, report);
  console.log(JSON.stringify({
    report_file: path.relative(APP, reportFile),
    lanes: laneResults.map(lane => ({
      lane_id: lane.lane_id,
      accepted_rows: lane.clean.accepted_rows,
      added: lane.refresh.added,
      updated: lane.refresh.updated,
      rejected_rows: lane.clean.rejected_rows
    })),
    failures,
    before,
    after,
    delta: report.delta
  }, null, 2));
  if (failures.length) process.exitCode = 2;
}

main().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
