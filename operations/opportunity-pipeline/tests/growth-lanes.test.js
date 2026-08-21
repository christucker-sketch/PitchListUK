const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { LANES, allLaneIds, selectLanes, COUNTY_LANES, IRELAND_LANES, FIRST_PARTY_WEAK_REGION_LANES } = require('../acquisition/lanes');

const root = path.resolve(__dirname, '..');

test('growth lanes have stable ids and useful queries', () => {
  const ids = allLaneIds();
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('london-food-trucks'));
  assert.ok(ids.includes('artisan-craft-markets'));
  assert.ok(ids.includes('county-cambridgeshire'));
  assert.ok(ids.includes('county-bristol'));
  assert.ok(ids.includes('county-suffolk'));
  assert.ok(COUNTY_LANES.length >= 70);
  for (const lane of LANES) {
    assert.match(lane.id, /^[a-z0-9-]+$/);
    assert.ok(lane.title);
    assert.ok(lane.category);
    assert.ok(lane.priority > 0);
    assert.ok(lane.queries.length >= 4);
  }
});

test('Republic-of-Ireland lanes are retained for history but excluded from the UK schedule', () => {
  assert.ok(IRELAND_LANES.length >= 15);
  assert.equal(LANES.some(lane => lane.id.startsWith('ireland-')), false);
  assert.equal(LANES.some(lane => lane.queries.some(query => /site:\.ie|Republic of Ireland/i.test(query))), false);
});

test('selectLanes defaults to priority order and respects max lanes', () => {
  const lanes = selectLanes([], 2);
  assert.deepEqual(lanes.map(lane => lane.id), ['london-food-trucks', 'weak-regions-first-party-applications']);
});

test('all UK regions are scheduled and audited weak regions are prioritised', () => {
  const required = ['county-county-durham', 'county-tyne-and-wear', 'county-northumberland', 'county-cumbria', 'county-south-yorkshire', 'county-dorset', 'county-buckinghamshire'];
  for (const id of required) assert.ok(allLaneIds().includes(id), id);
  const selected = selectLanes([], LANES.length);
  for (const id of required) assert.ok(selected.findIndex(lane => lane.id === id) < 20, id);
});

test('weak-region first-party lane targets exact official application routes', () => {
  assert.equal(FIRST_PARTY_WEAK_REGION_LANES.length, 1);
  const lane = FIRST_PARTY_WEAK_REGION_LANES[0];
  assert.equal(lane.queries.length, 8);
  for (const host of ['durhammarkets.co.uk', 'newcastle.gov.uk', 'northumberland.gov.uk', 'tastecumbria.co.uk', 'barnsley.gov.uk', 'rotherham.gov.uk', 'dorchester-tc.gov.uk', 'saundersmarkets.co.uk']) {
    assert.ok(lane.queries.some(query => query.includes(host)), host);
  }
  assert.equal(lane.queries.some(query => /street trading licence|street trading consent/i.test(query)), false);
});

test('county lanes script the same local searches used for sample discovery', () => {
  const lane = COUNTY_LANES.find(candidate => candidate.id === 'county-bristol');
  assert.ok(lane);
  assert.equal(lane.lane_type, 'county');
  assert.ok(lane.queries.some(query => /food festival trader application 2026/i.test(query)));
  assert.ok(lane.queries.some(query => /council street trading food vendor application/i.test(query)));
  assert.ok(lane.queries.some(query => /market stallholder application food vendor 2026/i.test(query)));
});

test('selectLanes resolves explicit lane ids', () => {
  const lanes = selectLanes(['artisan-craft-markets'], 5);
  assert.deepEqual(lanes.map(lane => lane.id), ['artisan-craft-markets']);
  assert.throws(() => selectLanes(['missing-lane'], 1), /Unknown growth lane/);
});

test('database growth dry-run does not require network or mutate data', () => {
  const result = spawnSync(process.execPath, ['scripts/grow-database.js', '--dry-run', '--max-lanes', '1', '--query-limit', '2'], {
    cwd: root,
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, 'dry-run');
  assert.equal(output.selected_lanes.length, 1);
  assert.equal(output.selected_lanes[0].planned_queries.length, 2);
});

test('scheduled apply entry point refuses to start without an aggregate credit cap', () => {
  const runtime = require('node:fs').mkdtempSync(path.join(require('node:os').tmpdir(), 'pitchlist-pipeline-'));
  const result = spawnSync(process.execPath, ['scripts/grow-database.js', '--apply', '--lane', 'county-county-durham', '--query-limit', '1'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PITCHLIST_PIPELINE_RUNTIME_DIR: runtime, SERPER_CREDITS_REMAINING: '', PITCHLIST_SERPER_RUN_BUDGET: '' }
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Serper run preflight blocked acquisition: credit_budget_missing/);
  assert.equal(require('node:fs').existsSync(path.join(runtime, 'data')), false);
});
