const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runFreshnessEngine, verifyRow } = require('../lib/freshness-engine');

function tempRoot(csv) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pitchlist-freshness-'));
  fs.mkdirSync(path.join(root, 'data'));
  fs.writeFileSync(path.join(root, 'data/events-active.csv'), csv);
  return root;
}

function csv(rows) {
  return `event_name,organiser,source_url,application_url,contact_email,location,region,event_start,event_end,application_deadline,stall_fee,vendor_categories,last_checked,confidence,notes,quality_score,quality_reasons,first_seen,last_seen,lifecycle_status
${rows.join('\n')}
`;
}

test('marks past events as expired without fetching', async () => {
  const result = await verifyRow({
    event_name: 'Past Market',
    source_url: 'https://example.com/past',
    application_url: 'https://example.com/past/app',
    event_start: '2026-05-01',
    event_end: '2026-05-02',
    last_checked: '2026-05-01',
    confidence: 'high',
    notes: ''
  }, {
    now: new Date('2026-07-07T12:00:00Z'),
    fetchText: async () => { throw new Error('should not fetch expired rows'); }
  });

  assert.equal(result.status, 'expired');
  assert.equal(result.row.lifecycle_status, 'expired');
  assert.match(result.row.notes, /expired/);
});

test('dry-run writes report but does not mutate active CSV', async () => {
  const root = tempRoot(csv([
    'Freshable Market,Fresh Org,https://example.com/source,https://example.com/app,,Leeds,Yorkshire & The Humber,2026-08-01,2026-08-01,,£50,street food,2026-05-01,medium,Old note,90,seed,2026-05-01,2026-05-01,active'
  ]));
  const before = fs.readFileSync(path.join(root, 'data/events-active.csv'), 'utf8');
  const report = await runFreshnessEngine(root, {
    now: new Date('2026-07-07T12:00:00Z'),
    apply: false,
    limit: 1,
    fetchText: async () => '<html><body>Trader application for street food vendors is open.</body></html>'
  });
  const after = fs.readFileSync(path.join(root, 'data/events-active.csv'), 'utf8');

  assert.equal(report.mode, 'dry-run');
  assert.equal(report.verified, 1);
  assert.equal(before, after);
  assert.equal(fs.existsSync(report.report_file), true);
});

test('apply mode updates last_checked and keeps backup', async () => {
  const root = tempRoot(csv([
    'Freshable Market,Fresh Org,https://example.com/source,https://example.com/app,,Leeds,Yorkshire & The Humber,2026-08-01,2026-08-01,,£50,street food,2026-05-01,medium,Old note,90,seed,2026-05-01,2026-05-01,active'
  ]));
  const report = await runFreshnessEngine(root, {
    now: new Date('2026-07-07T12:00:00Z'),
    apply: true,
    limit: 1,
    fetchText: async () => '<html><body>Trader application for street food vendors is open.</body></html>'
  });
  const after = fs.readFileSync(path.join(root, 'data/events-active.csv'), 'utf8');
  const backups = fs.readdirSync(path.join(root, 'data')).filter(name => /^events-active\.backup-/.test(name));

  assert.equal(report.mode, 'apply');
  assert.equal(report.changed, 1);
  assert.match(after, /2026-07-07/);
  assert.match(after, /Freshness engine 2026-07-07/);
  assert.equal(backups.length, 1);
});
