import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { enabledUkAcquisitionAreas, resolveUkAcquisitionArea } from '../platform/acquisition/uk-geography.mjs';
import { auditUkGeography } from '../scripts/audit-uk-geography-mapping.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseProductionSnapshot() {
  const source = fs.readFileSync(path.join(root, 'functions/_data/opportunities.mjs'), 'utf8');
  const match = source.match(/export\s+const\s+opportunitySnapshot\s*=\s*([\s\S]*);\s*$/);
  assert.ok(match, 'UK production snapshot should parse');
  return JSON.parse(match[1]);
}

test('canonical UK acquisition registry has unique enabled codes and orders', () => {
  const areas = enabledUkAcquisitionAreas();
  assert.ok(areas.length >= 48);
  assert.equal(new Set(areas.map(area => area.code)).size, areas.length);
  assert.equal(new Set(areas.map(area => area.schedule_order)).size, areas.length);
});

test('common legacy county aliases map to canonical acquisition areas', () => {
  assert.equal(resolveUkAcquisitionArea({ county: 'Kent' }).area.code, 'GB-ENG-KENT');
  assert.equal(resolveUkAcquisitionArea({ county: 'Greater London' }).area.code, 'GB-ENG-LONDON');
  assert.equal(resolveUkAcquisitionArea({ region: 'Cumberland' }).area.code, 'GB-ENG-CUMB');
  assert.equal(resolveUkAcquisitionArea({ region: 'County Durham' }).area.code, 'GB-ENG-DURHAM');
  assert.equal(resolveUkAcquisitionArea({ county: 'Northern Ireland' }).area.code, 'GB-NIR');
});

test('broad geography is preserved in an explicit review queue rather than silently assigned', () => {
  const result = resolveUkAcquisitionArea({ county: 'United Kingdom', region: 'UK' });
  assert.equal(result.status, 'review');
  assert.equal(result.reason, 'broad_geography_requires_review');
});

test('production UK snapshot maps every row or explicitly queues it without changing count or IDs', () => {
  const snapshot = parseProductionSnapshot();
  const beforeIds = snapshot.rows.map(row => row.id);
  const report = auditUkGeography(snapshot);

  assert.equal(report.snapshot_rows, snapshot.rows.length);
  assert.equal(report.mapped_count + report.review_count, snapshot.rows.length);
  assert.equal(report.integrity.row_count_unchanged, true);
  assert.equal(report.integrity.no_rows_dropped, true);
  assert.equal(report.integrity.stable_ids_preserved, true);
  assert.deepEqual(snapshot.rows.map(row => row.id), beforeIds);
});
