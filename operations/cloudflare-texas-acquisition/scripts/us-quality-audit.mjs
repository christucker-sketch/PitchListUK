#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { usOpportunitySnapshot } from '../../../functions/_data/us-opportunities.mjs';
import { enabledStates } from '../src/us-state-registry.js';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../../..');
const defaultOutput = path.join(repositoryRoot, 'artifacts/us-quality-audit.md');
const DAY = 24 * 60 * 60 * 1000;

const asArray = value => Array.isArray(value) ? value : [];
const text = value => String(value ?? '').trim();
const lower = value => text(value).toLowerCase();
const unique = values => [...new Set(values.filter(Boolean))];

function dateValue(value) {
  if (!text(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function domainOf(value) {
  try { return new URL(value).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

function normalizedIdentity(row) {
  return [lower(row.event_name).replace(/[^a-z0-9]+/g, ' '), lower(row.locality || row.location).replace(/[^a-z0-9]+/g, ' '), lower(row.region_code)].join('|');
}

function duplicateGroups(rows, keyFn) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    const values = groups.get(key) || [];
    values.push(row);
    groups.set(key, values);
  }
  return [...groups.entries()].filter(([, values]) => values.length > 1).map(([key, values]) => ({ key, ids: values.map(row => row.stable_id || row.id), count: values.length }));
}

function recordIssue(bucket, row, reason, severity = 'warning') {
  bucket.push({
    id: row.stable_id || row.id || '',
    state: row.region_code || '',
    event_name: row.event_name || '',
    source_url: row.source_url || '',
    reason,
    severity
  });
}

export function auditUsOpportunities(snapshot, options = {}) {
  const rows = asArray(snapshot?.rows);
  const states = options.states || enabledStates();
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const nowMs = now.getTime();
  const issues = [];
  const presentationFlags = [];
  const stateRows = new Map(states.map(state => [state.code, []]));

  for (const row of rows) {
    if (stateRows.has(row.region_code)) stateRows.get(row.region_code).push(row);
    if (!text(row.event_name)) recordIssue(issues, row, 'missing event_name', 'critical');
    if (!text(row.organiser)) recordIssue(issues, row, 'missing organiser', 'warning');
    if (!text(row.source_url)) recordIssue(issues, row, 'missing source_url', 'critical');
    if (!text(row.application_url)) recordIssue(issues, row, 'missing application_url', 'warning');
    if (!text(row.locality || row.location)) recordIssue(issues, row, 'missing locality/location', 'warning');
    if (row.country_code !== 'US') recordIssue(issues, row, `unexpected country_code ${row.country_code || '(blank)'}`, 'critical');
    if (row.currency !== 'USD') recordIssue(issues, row, `unexpected currency ${row.currency || '(blank)'}`, 'warning');
    if (row.publishable !== true) recordIssue(issues, row, 'publishable is not true', 'critical');
    if (row.quality_status !== 'customer_ready') recordIssue(issues, row, `quality_status is ${row.quality_status || '(blank)'}`, 'warning');
    if (text(row.source_url) && !/^https:\/\//i.test(row.source_url)) recordIssue(issues, row, 'source_url is not HTTPS', 'warning');
    if (text(row.application_url) && !/^https:\/\//i.test(row.application_url)) recordIssue(issues, row, 'application_url is not HTTPS', 'warning');

    const deadline = dateValue(row.application_deadline);
    const eventEnd = dateValue(row.event_end);
    const eventStart = dateValue(row.event_start);
    if (deadline && deadline < nowMs && row.recurring !== true) recordIssue(issues, row, `application deadline passed ${row.application_deadline}`, 'warning');
    if (eventEnd && eventEnd < nowMs && row.recurring !== true) recordIssue(issues, row, `event ended ${row.event_end}`, 'warning');
    else if (!eventEnd && eventStart && eventStart + DAY < nowMs && row.recurring !== true) recordIssue(issues, row, `event start passed ${row.event_start} with no future end date`, 'warning');

    if (/\b(form center|official website|vendor application\s*\||application form|forms?)\b/i.test(text(row.event_name))) {
      recordIssue(presentationFlags, row, 'user-facing event title looks like scraped page chrome rather than a clean opportunity title', 'presentation');
    }
  }

  const exactIds = duplicateGroups(rows, row => text(row.stable_id || row.id));
  const sourceIds = duplicateGroups(rows, row => text(row.source_id));
  const sourceUrls = duplicateGroups(rows, row => lower(row.source_url));
  const applicationUrls = duplicateGroups(rows, row => lower(row.application_url));
  const semantic = duplicateGroups(rows, normalizedIdentity);

  const domainCounts = new Map();
  for (const row of rows) {
    const domain = domainOf(row.source_url);
    if (domain) domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
  }
  const topDomains = [...domainCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 15).map(([domain, count]) => ({ domain, count, share: rows.length ? count / rows.length : 0 }));

  const categoryCounts = new Map();
  for (const row of rows) for (const category of asArray(row.vendor_categories)) categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);

  const stateSummary = states.map(state => {
    const scopedRows = stateRows.get(state.code) || [];
    return {
      code: state.code,
      name: state.name,
      count: scopedRows.length,
      critical: issues.filter(item => item.state === state.code && item.severity === 'critical').length,
      warnings: issues.filter(item => item.state === state.code && item.severity === 'warning').length,
      presentation_flags: presentationFlags.filter(item => item.state === state.code).length
    };
  });

  const emptyStates = stateSummary.filter(item => item.count === 0);
  const thinStates = stateSummary.filter(item => item.count > 0 && item.count < Number(options.thinThreshold || 5));
  const criticalCount = issues.filter(item => item.severity === 'critical').length;
  const warningCount = issues.filter(item => item.severity === 'warning').length;
  const duplicateRiskGroups = exactIds.length + sourceIds.length + sourceUrls.length + applicationUrls.length + semantic.length;
  const populatedStates = stateSummary.filter(item => item.count > 0).length;

  let score = 100;
  score -= Math.min(35, criticalCount * 5);
  score -= Math.min(20, warningCount * 0.5);
  score -= Math.min(15, duplicateRiskGroups * 2);
  score -= Math.min(20, emptyStates.length * 1.5);
  score -= Math.min(10, thinStates.length * 0.5);
  score = Math.max(0, Math.round(score));

  return {
    generated_at: now.toISOString(),
    exported_at: snapshot?.exported_at || null,
    total: rows.length,
    declared_total: Number(snapshot?.total || 0),
    score,
    summary: {
      states_total: states.length,
      states_populated: populatedStates,
      states_empty: emptyStates.length,
      states_thin: thinStates.length,
      critical_issues: criticalCount,
      warnings: warningCount,
      presentation_flags: presentationFlags.length,
      duplicate_risk_groups: duplicateRiskGroups,
      source_domains: domainCounts.size,
      categories: categoryCounts.size
    },
    state_summary: stateSummary,
    empty_states: emptyStates,
    thin_states: thinStates,
    issues,
    presentation_flags: presentationFlags,
    duplicates: {
      stable_id: exactIds,
      source_id: sourceIds,
      source_url: sourceUrls,
      application_url: applicationUrls,
      normalized_name_locality_state: semantic
    },
    top_source_domains: topDomains,
    categories: [...categoryCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([category, count]) => ({ category, count }))
  };
}

export function renderAuditMarkdown(audit) {
  const s = audit.summary;
  const lines = [
    '# FindPitches US Opportunity Quality Audit', '',
    `Generated: ${audit.generated_at}`,
    `Snapshot exported: ${audit.exported_at || 'unknown'}`, '',
    '## Executive summary', '',
    `- Quality score: **${audit.score}/100**`,
    `- Opportunities: **${audit.total}** (snapshot declares ${audit.declared_total})`,
    `- States populated: **${s.states_populated}/${s.states_total}**`,
    `- Empty states: **${s.states_empty}**`,
    `- Thin states (<5 opportunities): **${s.states_thin}**`,
    `- Critical data issues: **${s.critical_issues}**`,
    `- Warnings: **${s.warnings}**`,
    `- Presentation-only title flags: **${s.presentation_flags}**`,
    `- Duplicate-risk groups: **${s.duplicate_risk_groups}**`,
    `- Distinct source domains: **${s.source_domains}**`, '',
    '## State coverage', '',
    '| State | Opportunities | Critical | Warnings | Presentation |',
    '|---|---:|---:|---:|---:|'
  ];

  for (const row of audit.state_summary) lines.push(`| ${row.code} — ${row.name} | ${row.count} | ${row.critical} | ${row.warnings} | ${row.presentation_flags} |`);

  if (audit.empty_states.length) lines.push('', '### Empty states', '', audit.empty_states.map(item => `${item.code} — ${item.name}`).join(', '));
  if (audit.thin_states.length) lines.push('', '### Thin states', '', audit.thin_states.map(item => `${item.code} (${item.count})`).join(', '));

  lines.push('', '## Top source domains', '', '| Domain | Opportunities | Share |', '|---|---:|---:|');
  for (const item of audit.top_source_domains) lines.push(`| ${item.domain} | ${item.count} | ${(item.share * 100).toFixed(1)}% |`);

  lines.push('', '## Category coverage', '', '| Category | Opportunities |', '|---|---:|');
  for (const item of audit.categories) lines.push(`| ${item.category} | ${item.count} |`);

  const duplicateKinds = Object.entries(audit.duplicates).filter(([, groups]) => groups.length);
  if (duplicateKinds.length) {
    lines.push('', '## Duplicate-risk groups', '');
    for (const [kind, groups] of duplicateKinds) {
      lines.push(`### ${kind}`, '');
      for (const group of groups.slice(0, 25)) lines.push(`- ${group.key} — ${group.count} records: ${group.ids.join(', ')}`);
    }
  }

  if (audit.issues.length) {
    lines.push('', '## Data-quality findings', '');
    for (const item of audit.issues.slice(0, 100)) lines.push(`- **${item.severity.toUpperCase()}** ${item.state || '??'} ${item.id || '(no id)'} — ${item.reason} — ${item.event_name || '(untitled)'}`);
  }

  if (audit.presentation_flags.length) {
    lines.push('', '## Presentation cleanup candidates', '');
    for (const item of audit.presentation_flags.slice(0, 100)) lines.push(`- ${item.state || '??'} ${item.id || '(no id)'} — ${item.event_name || '(untitled)'}`);
  }

  return `${lines.join('\n')}\n`;
}

function argumentValue(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

export function main(argv = process.argv.slice(2)) {
  const format = String(argumentValue(argv, '--format', 'markdown')).toLowerCase();
  const output = argumentValue(argv, '--output', null);
  const thinThreshold = Number(argumentValue(argv, '--thin-threshold', 5));
  if (!['markdown', 'json'].includes(format)) throw new Error(`Unsupported audit format: ${format}`);
  const audit = auditUsOpportunities(usOpportunitySnapshot, { thinThreshold });
  const rendered = format === 'json' ? `${JSON.stringify(audit, null, 2)}\n` : renderAuditMarkdown(audit);
  if (output) {
    const resolved = path.resolve(output || defaultOutput);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, rendered);
  } else {
    process.stdout.write(rendered);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
