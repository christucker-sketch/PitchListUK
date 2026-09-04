#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { enabledStates } from '../src/us-state-registry.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../../..');
const defaultStateFile = path.join(os.homedir(), '.local/state/findpitches-us-growth/controller.json');
const githubRepository = 'christucker-sketch/PitchListUK';

const asArray = value => Array.isArray(value) ? value : [];
const integer = (value, fallback = 0) => Number.isInteger(Number(value)) ? Number(value) : fallback;
const unique = values => [...new Set(values.filter(value => value !== null && value !== undefined && value !== ''))];

function resultMode(result) {
  const explicit = String(result?.mode || '').toLowerCase();
  if (explicit === 'discover' || explicit === 'acquire') return explicit;
  if (result?.publication?.source_count !== undefined || result?.generated_source_count !== undefined) return 'discover';
  if (result?.additions !== undefined || result?.before !== undefined || result?.after !== undefined) return 'acquire';
  return 'unknown';
}

const resultStateCode = result => String(result?.state_code || result?.region_code || '').trim().toUpperCase();
const blockerStateCode = blocker => String(blocker?.state_code || blocker?.region_code || blocker?.intent?.state_code || '').trim().toUpperCase();

function resultPrNumber(result) {
  const value = Number(result?.publication?.pr_number || result?.pr_number || 0);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function sourceAdditionCount(result) {
  const publication = result?.publication || {};
  return Math.max(0, integer(publication.source_count, integer(publication.source_ids?.length, integer(result?.generated_source_count, 0))));
}

const opportunityAdditionCount = result => Math.max(0, integer(result?.additions, 0));

function deferredKey(unit) {
  return [unit?.mode || '', unit?.state_code || '', unit?.query_offset ?? '', unit?.query_limit ?? '', unit?.batch_number ?? '', unit?.instance_id || ''].join(':');
}

export function buildSweepReport(state, options = {}) {
  const registry = options.states || enabledStates();
  const results = asArray(state?.results);
  const deployments = asArray(state?.deployments);
  const deferred = asArray(state?.deferred_units);
  const blockers = asArray(state?.blockers);
  const github = options.github || {};

  const rows = registry.map(scoped => {
    const stateResults = results.filter(result => resultStateCode(result) === scoped.code);
    const discoveries = stateResults.filter(result => resultMode(result) === 'discover');
    const acquisitions = stateResults.filter(result => resultMode(result) === 'acquire');
    const stateDeployments = deployments.filter(item => String(item?.state_code || '').toUpperCase() === scoped.code);
    const stateDeferred = deferred.filter(item => String(item?.state_code || '').toUpperCase() === scoped.code);
    const stateBlockers = blockers.filter(item => blockerStateCode(item) === scoped.code && item?.resolved !== true);
    const sourcePrs = unique(discoveries.map(resultPrNumber));
    const dataPrs = unique(acquisitions.map(resultPrNumber));
    const prNumbers = unique([...sourcePrs, ...dataPrs]);
    const prs = prNumbers.map(number => ({
      number,
      type: sourcePrs.includes(number) ? 'source' : 'data',
      merged: github[number]?.merged ?? null,
      merged_sha: github[number]?.merged_sha || null,
      url: github[number]?.url || `https://github.com/${githubRepository}/pull/${number}`
    }));
    const additions = acquisitions.reduce((sum, item) => sum + opportunityAdditionCount(item), 0);
    const sourceAdditions = discoveries.reduce((sum, item) => sum + sourceAdditionCount(item), 0);
    const touched = stateResults.length > 0 || stateDeployments.length > 0 || stateDeferred.length > 0 || stateBlockers.length > 0;

    return {
      code: scoped.code,
      name: scoped.name,
      schedule_order: scoped.schedule_order,
      opportunity_total: integer(state?.state_totals?.[scoped.code], 0),
      additions,
      source_additions: sourceAdditions,
      discovery_runs: discoveries.length,
      acquisition_runs: acquisitions.length,
      zero_addition_runs: acquisitions.filter(item => opportunityAdditionCount(item) === 0).length,
      workflow_instance_ids: unique(stateResults.map(item => item?.instance_id)),
      source_prs: sourcePrs,
      data_prs: dataPrs,
      prs,
      deployment_shas: unique(stateDeployments.map(item => item?.production_sha)),
      deferred_units: stateDeferred,
      blockers: stateBlockers,
      touched
    };
  });

  const resolvedDeferredKeys = new Set(asArray(state?.resolved_deferred_units).map(deferredKey));
  const unresolvedDeferred = deferred.filter(item => !resolvedDeferredKeys.has(deferredKey(item)));
  const genuineBlockers = blockers.filter(item => item?.resolved !== true);
  const statesTouched = rows.filter(row => row.touched).length;
  const explicitSweepComplete = state?.sweep_complete === true;

  return {
    generated_at: options.generatedAt || new Date().toISOString(),
    controller: {
      status: state?.status || null,
      updated_at: state?.updated_at || null,
      snapshot_count: integer(state?.snapshot_count, 0),
      live_api_count: integer(state?.live_api_count, integer(state?.snapshot_count, 0)),
      target_count: integer(state?.target_count, 0),
      approved_source_count: integer(state?.approved_source_count, 0),
      worker_version: state?.worker_version || null,
      worker_sha: state?.worker_sha || null,
      current: state?.current || null,
      active_instance: state?.active_instance || null
    },
    summary: {
      states_total: rows.length,
      states_touched: statesTouched,
      states_missing: rows.length - statesTouched,
      states_with_additions: rows.filter(row => row.additions > 0).length,
      states_zero_additions: rows.filter(row => row.touched && row.additions === 0).length,
      opportunity_additions_recorded: rows.reduce((sum, row) => sum + row.additions, 0),
      source_additions_recorded: rows.reduce((sum, row) => sum + row.source_additions, 0),
      discovery_runs: rows.reduce((sum, row) => sum + row.discovery_runs, 0),
      acquisition_runs: rows.reduce((sum, row) => sum + row.acquisition_runs, 0),
      deferred_units: unresolvedDeferred.length,
      blockers: genuineBlockers.length,
      explicit_sweep_complete: explicitSweepComplete,
      completion_integrity_passed: explicitSweepComplete && statesTouched === rows.length && unresolvedDeferred.length === 0 && genuineBlockers.length === 0
    },
    deferred_units: unresolvedDeferred,
    blockers: genuineBlockers,
    latest_resilience_event: asArray(state?.resilience_events).at(-1) || null,
    last_result: results.at(-1) || null,
    last_deployment: deployments.at(-1) || null,
    states: rows
  };
}

export function renderMarkdown(report) {
  const s = report.summary;
  const c = report.controller;
  const lines = [
    '# FindPitches US Nationwide Acquisition Sweep', '',
    `Generated: ${report.generated_at}`, '',
    '## Executive checkpoint', '',
    `- Controller: **${c.status || 'unknown'}**`,
    `- Production opportunities: **${c.snapshot_count}** (live API: ${c.live_api_count})`,
    `- Approved sources: **${c.approved_source_count}**`,
    `- States touched: **${s.states_touched}/${s.states_total}**`,
    `- States with additions: **${s.states_with_additions}**`,
    `- States touched with zero additions: **${s.states_zero_additions}**`,
    `- Recorded opportunity additions: **${s.opportunity_additions_recorded}**`,
    `- Recorded source additions: **${s.source_additions_recorded}**`,
    `- Deferred units outstanding: **${s.deferred_units}**`,
    `- Genuine blockers: **${s.blockers}**`,
    `- Nationwide completion integrity: **${s.completion_integrity_passed ? 'PASS' : 'NOT COMPLETE'}**`, '',
    '## State-by-state checkpoint', '',
    '| State | Opps | Added | Source adds | Discover | Acquire | Zero-add | Deferred | Blockers | PRs / merged SHA |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|'
  ];

  for (const row of report.states) {
    const prs = row.prs.length
      ? row.prs.map(pr => `#${pr.number}${pr.merged_sha ? ` @ ${pr.merged_sha.slice(0, 12)}` : pr.merged === false ? ' (unmerged)' : ''}`).join('<br>')
      : '—';
    lines.push(`| ${row.code} — ${row.name} | ${row.opportunity_total} | ${row.additions} | ${row.source_additions} | ${row.discovery_runs} | ${row.acquisition_runs} | ${row.zero_addition_runs} | ${row.deferred_units.length} | ${row.blockers.length} | ${prs} |`);
  }

  if (report.deferred_units.length) {
    lines.push('', '## Deferred units', '');
    for (const item of report.deferred_units) lines.push(`- ${item.state_code || '??'} ${item.mode || 'unknown'} — offset ${item.query_offset ?? '—'}, batch ${item.batch_number ?? '—'}, reason: ${item.reason || 'unknown'}, workflow: ${item.instance_id || '—'}`);
  }

  if (report.blockers.length) {
    lines.push('', '## Genuine blockers', '');
    for (const item of report.blockers) lines.push(`- ${blockerStateCode(item) || '??'} — ${item.reason || item.error || item.detail || 'unspecified blocker'}`);
  }

  return `${lines.join('\n')}\n`;
}

function argumentValue(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function enrichGithub(report) {
  const prNumbers = unique(report.states.flatMap(row => [...row.source_prs, ...row.data_prs]));
  const github = {};
  for (const number of prNumbers) {
    try {
      const payload = JSON.parse(execFileSync('gh', ['pr', 'view', String(number), '--repo', githubRepository, '--json', 'number,state,mergedAt,mergeCommit,url'], {
        cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
      }));
      github[number] = { merged: Boolean(payload.mergedAt), merged_sha: payload.mergeCommit?.oid || null, url: payload.url || null };
    } catch {
      github[number] = { merged: null, merged_sha: null, url: null };
    }
  }
  return github;
}

export function main(argv = process.argv.slice(2)) {
  const stateFile = path.resolve(argumentValue(argv, '--state-file', process.env.PITCHLIST_GROWTH_STATE_FILE || defaultStateFile));
  const format = String(argumentValue(argv, '--format', 'markdown')).toLowerCase();
  if (!['markdown', 'json'].includes(format)) throw new Error(`Unsupported report format: ${format}`);
  const output = argumentValue(argv, '--output', null);
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const base = buildSweepReport(state, { github: {} });
  const github = argv.includes('--no-github') ? {} : enrichGithub(base);
  const report = buildSweepReport(state, { github });
  const rendered = format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report);
  if (output) fs.writeFileSync(path.resolve(output), rendered);
  else process.stdout.write(rendered);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
