// Scheduled, bounded replay of legacy PDF dead letters in the isolated v2 D1.
// Uses a persistent ledger, one 25-row batch at a time, and stops on unhealthy outcomes.
const API = 'https://api.cloudflare.com/client/v4';
const DB = '6732bcc9-a172-4d38-ad4d-7660ed13392f';
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const batch = String(process.env.GITHUB_RUN_ID || '') + '-' + String(process.env.GITHUB_RUN_ATTEMPT || '1');
const LIMIT = 25;
// Avoid D1's SQLITE_ERROR for complex LIKE/GLOB patterns. Match only the
// legacy unsupported-content-type error prefix containing PDF, not new parse failures.\nconst LEGACY_PDF_CONDITION = "instr(q.last_error, 'findpitches_v2_fetch_content_type_unsupported:') = 1 AND instr(lower(q.last_error), 'pdf') > 0";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

if (!token || !account || !process.env.GITHUB_RUN_ID) {
  throw new Error('Missing Cloudflare credentials or GitHub run identifier');
}

async function query(sql, params = []) {
  const response = await fetch(API + '/accounts/' + encodeURIComponent(account) + '/d1/database/' + DB + '/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ sql, params })
  });
  const result = await response.json();
  if (!response.ok || !result.success || result.errors?.length || result.result?.some(r => !r.success)) {
    throw new Error('D1 query rejected: ' + JSON.stringify(result.errors || result.result?.map(r => r.error)).slice(0, 500));
  }
  return result.result?.[0]?.results || [];
}
async function status(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error('Worker status HTTP ' + response.status);
  const body = await response.json();
  if (!body.ok) throw new Error('Worker reports unhealthy: ' + body.service);
  return body;
}
async function healthGate() {
  const [shadow, enrichment] = await Promise.all([
    status('https://api.findpitches.com/status'),
    status('https://findpitches-v2-enrichment.ctucker.workers.dev/status')
  ]);
  if (shadow.mode !== 'shadow' || shadow.publication_enabled !== false || !shadow.search_configured) {
    throw new Error('Shadow mode, publication safety or discovery health check failed');
  }
  if (Number(shadow.classifier?.expired || 0) > 5 || Number(shadow.enrichment?.expired || 0) > 5) {
    throw new Error('Queue leases are not healthy; replay blocked');
  }
  return { shadow, enrichment };
}
function report(message) {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) {
    // Summary is additive; use asynchronous fs calls to avoid log content carrying secrets.
    return import('node:fs/promises').then(fs => fs.appendFile(process.env.GITHUB_STEP_SUMMARY, message + '\n'));
  }
}

await query("CREATE TABLE IF NOT EXISTS pdf_recovery_ledger (lane TEXT NOT NULL, candidate_id TEXT NOT NULL, batch_id TEXT NOT NULL, released_at TEXT NOT NULL, PRIMARY KEY(lane,candidate_id))");
const gate = await healthGate();
const lanes = ['enrichment', 'classification'];
const tables = { enrichment: 'enrichment_queue', classification: 'classification_queue' };
const prior = await query("SELECT batch_id, lane, COUNT(*) AS total, SUM(CASE WHEN q.status='complete' THEN 1 ELSE 0 END) AS complete, SUM(CASE WHEN q.status='dead' THEN 1 ELSE 0 END) AS dead, SUM(CASE WHEN q.status IN ('ready','leased') THEN 1 ELSE 0 END) AS active FROM pdf_recovery_ledger l JOIN enrichment_queue q ON l.lane='enrichment' AND l.candidate_id=q.candidate_id GROUP BY batch_id,lane UNION ALL SELECT batch_id,lane,COUNT(*),SUM(CASE WHEN q.status='complete' THEN 1 ELSE 0 END),SUM(CASE WHEN q.status='dead' THEN 1 ELSE 0 END),SUM(CASE WHEN q.status IN ('ready','leased') THEN 1 ELSE 0 END) FROM pdf_recovery_ledger l JOIN classification_queue q ON l.lane='classification' AND l.candidate_id=q.candidate_id GROUP BY batch_id,lane ORDER BY batch_id DESC LIMIT 1");
if (prior.length) {
  const previous = prior[0];
  await report('Previous PDF batch ' + previous.batch_id + ': ' + JSON.stringify(previous));
  if (Number(previous.dead) >= 4) throw new Error('Previous batch has 4+ failed rows; manual investigation required');
  if (Number(previous.active) > 0) {
    await report('Prior PDF batch still processing; no new rows released.');
    process.exit(0);
  }
}
const remaining = {};
for (const lane of lanes) {
  const table = tables[lane];
  const rows = await query("SELECT COUNT(*) AS count FROM " + table + " q LEFT JOIN pdf_recovery_ledger l ON l.lane=? AND l.candidate_id=q.candidate_id WHERE q.status='dead' AND " + LEGACY_PDF_CONDITION + " AND l.candidate_id IS NULL", [lane]);
  remaining[lane] = Number(rows[0]?.count || 0);
}
await report('Unreleased legacy PDF dead letters: ' + JSON.stringify(remaining));
if (!remaining.enrichment && !remaining.classification) {
  await report('Legacy PDF recovery finished; no eligible dead letters remain.');
  process.exit(0);
}
const lane = remaining.enrichment ? 'enrichment' : 'classification';
const table = tables[lane];
const active = lane === 'enrichment' ? gate.shadow.enrichment : gate.shadow.classifier;
const maxReady = lane === 'enrichment' ? 60 : 70;
if (Number(active.ready || 0) > maxReady || Number(active.leased || 0) > 24) {
  await report('Existing ' + lane + ' queue busy; deferred replay without mutation.');
  process.exit(0);
}
// Ledger first, then targeted release. All selections exclude any previous replay.
const now = new Date().toISOString();
await query("INSERT OR IGNORE INTO pdf_recovery_ledger(lane,candidate_id,batch_id,released_at) SELECT ?,q.candidate_id,?,? FROM " + table + " q LEFT JOIN pdf_recovery_ledger l ON l.lane=? AND l.candidate_id=q.candidate_id WHERE q.status='dead' AND " + LEGACY_PDF_CONDITION + " AND l.candidate_id IS NULL ORDER BY q.updated_at,q.candidate_id LIMIT ?", [lane,batch,now,lane,LIMIT]);
const selected = await query("SELECT candidate_id FROM pdf_recovery_ledger WHERE lane=? AND batch_id=?", [lane,batch]);
if (!selected.length) process.exit(0);
const placeholders = selected.map(() => '?').join(',');
await query("UPDATE " + table + " SET status='ready',attempts=0,available_at=?,lease_until=NULL,last_error=NULL,updated_at=? WHERE status='dead' AND instr(last_error, 'findpitches_v2_fetch_content_type_unsupported:') = 1 AND instr(lower(last_error), 'pdf') > 0 AND candidate_id IN (" + placeholders + ")", [now,now,...selected.map(item => item.candidate_id)]);
await report('Released ' + selected.length + ' ' + lane + ' PDF dead letters in batch ' + batch + ' (one replay per row).');
// Give the dedicated Workers time to pick up the batch; never release another
// while the ledger reports active rows or an excessive dead-letter rate.
await sleep(90000);
const rows = await query("SELECT q.status,COUNT(*) AS count FROM pdf_recovery_ledger l JOIN " + table + " q ON q.candidate_id=l.candidate_id WHERE l.batch_id=? AND l.lane=? GROUP BY q.status ORDER BY q.status", [batch,lane]);
await report('Post-release batch outcome: ' + JSON.stringify(rows));
const health = await healthGate();
await report('Post-release queues: classifier=' + JSON.stringify(health.shadow.classifier) + ', enrichment=' + JSON.stringify(health.shadow.enrichment));
if (rows.some(r => r.status === 'dead' && Number(r.count) >= 4)) {
  throw new Error('4+ failures in this batch; subsequent scheduled runs will stop until inspected');
}
