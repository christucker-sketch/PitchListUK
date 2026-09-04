#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enabledUkAcquisitionAreas, resolveUkAcquisitionArea } from '../platform/acquisition/uk-geography.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotFile = path.join(root, 'functions/_data/opportunities.mjs');

function parseSnapshot(source) {
  const match = String(source).match(/export\s+const\s+opportunitySnapshot\s*=\s*([\s\S]*);\s*$/);
  if (!match) throw new Error('Could not parse UK opportunity snapshot');
  return JSON.parse(match[1]);
}

export function auditUkGeography(snapshot) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const mapped = [];
  const review = [];
  const byArea = Object.fromEntries(enabledUkAcquisitionAreas().map(area => [area.code, 0]));
  const originalIds = rows.map(row => row.id);

  for (const row of rows) {
    const resolution = resolveUkAcquisitionArea(row);
    const entry = {
      id: row.id,
      event_name: row.event_name,
      county: row.county || '',
      region: row.region || '',
      location: row.location || '',
      status: resolution.status,
      area_code: resolution.area?.code || null,
      area_name: resolution.area?.name || null,
      reason: resolution.reason || null,
      matched_value: resolution.matched_value || null,
      inferred: resolution.inferred === true
    };
    if (resolution.status === 'mapped') {
      mapped.push(entry);
      byArea[resolution.area.code] = (byArea[resolution.area.code] || 0) + 1;
    } else review.push(entry);
  }

  const duplicateIds = [...new Set(originalIds.filter((id, index) => originalIds.indexOf(id) !== index))];
  return {
    generated_at: new Date().toISOString(),
    snapshot_total_declared: Number(snapshot?.total || 0),
    snapshot_rows: rows.length,
    ids_preserved: duplicateIds.length === 0 && originalIds.every(Boolean),
    duplicate_ids: duplicateIds,
    mapped_count: mapped.length,
    review_count: review.length,
    coverage_percent: rows.length ? Number(((mapped.length / rows.length) * 100).toFixed(2)) : 100,
    areas_total: enabledUkAcquisitionAreas().length,
    populated_areas: Object.values(byArea).filter(count => count > 0).length,
    empty_areas: Object.entries(byArea).filter(([,count]) => count === 0).map(([code]) => code),
    by_area: byArea,
    review,
    integrity: {
      row_count_unchanged: Number(snapshot?.total || rows.length) === rows.length,
      no_rows_dropped: mapped.length + review.length === rows.length,
      stable_ids_preserved: duplicateIds.length === 0 && originalIds.every(Boolean)
    }
  };
}

export function renderMarkdown(report) {
  const lines = [
    '# UK Acquisition Geography Mapping Audit','',
    `Generated: ${report.generated_at}`,'',
    `- Existing opportunities: **${report.snapshot_rows}**`,
    `- Canonically mapped: **${report.mapped_count}**`,
    `- Explicit review queue: **${report.review_count}**`,
    `- Mapping coverage: **${report.coverage_percent}%**`,
    `- Acquisition areas: **${report.areas_total}**`,
    `- Areas already populated: **${report.populated_areas}**`,
    `- Row-count integrity: **${report.integrity.row_count_unchanged ? 'PASS' : 'FAIL'}**`,
    `- Stable-ID integrity: **${report.integrity.stable_ids_preserved ? 'PASS' : 'FAIL'}**`,
    `- No rows dropped: **${report.integrity.no_rows_dropped ? 'PASS' : 'FAIL'}**`,'',
    '## Area counts','',
    '| Area | Opportunities |','|---|---:|'
  ];
  const index = new Map(enabledUkAcquisitionAreas().map(area => [area.code, area]));
  for (const [code,count] of Object.entries(report.by_area)) lines.push(`| ${code} — ${index.get(code)?.name || code} | ${count} |`);
  if (report.review.length) {
    lines.push('','## Explicit review queue','');
    for (const item of report.review) lines.push(`- ${item.id} — ${item.event_name || 'Unnamed'} — ${item.reason}; geography=${item.matched_value || 'blank'}`);
  }
  return `${lines.join('\n')}\n`;
}

export function main(argv = process.argv.slice(2)) {
  const source = fs.readFileSync(snapshotFile, 'utf8');
  const snapshot = parseSnapshot(source);
  const report = auditUkGeography(snapshot);
  const json = argv.includes('--json');
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report));
  if (!report.integrity.row_count_unchanged || !report.integrity.no_rows_dropped || !report.integrity.stable_ids_preserved) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
