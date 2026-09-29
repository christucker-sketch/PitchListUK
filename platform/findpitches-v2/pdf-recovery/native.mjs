import { TERMINAL_PDF_ERROR_CODES } from '../providers/fetch/pdf-error-policy.mjs';
// Cloudflare-native, bounded recovery: no GitHub Actions schedule dependency.
// This uses the same production D1 ledger as the existing operator workflow.
const LEGACY_PDF = "instr(q.last_error, 'findpitches_v2_fetch_content_type_unsupported:') = 1 AND instr(lower(q.last_error), 'pdf') > 0";
const TABLES = Object.freeze({enrichment:'enrichment_queue',classification:'classification_queue'});
const BATCH_LIMIT = 25;
const MIN_INTERVAL_MS = 15 * 60_000;
// Explicit fixed codes only. Unknown failure reasons count towards the safety gate.
const terminalSql = TERMINAL_PDF_ERROR_CODES.map(code => "'" + code + "'").join(',');
const terminalCountSql = `SUM(CASE WHEN q.status='dead' AND q.last_error IN (${terminalSql}) THEN 1 ELSE 0 END) AS terminal_dead`;

async function all(db, sql, ...params) {
  const result = await db.prepare(sql).bind(...params).all();
  return result.results || [];
}
async function first(db, sql, ...params) {
  return db.prepare(sql).bind(...params).first();
}

export async function runNativePdfRecovery(db, { now = new Date() } = {}) {
  if (!db?.prepare) throw new Error('findpitches_v2_pdf_recovery_db_missing');
  const timestamp = now.toISOString();
  await db.prepare(`CREATE TABLE IF NOT EXISTS pdf_recovery_ledger (
    lane TEXT NOT NULL, candidate_id TEXT NOT NULL, batch_id TEXT NOT NULL,
    released_at TEXT NOT NULL, PRIMARY KEY(lane,candidate_id)
  )`).run();

  // Never release more while any recorded batch is still running. The previous
  // batch's dead-letter threshold remains identical to the operator workflow.
  const previous = await all(db, `SELECT l.batch_id,l.lane,MIN(l.released_at) AS released_at,
    COUNT(*) AS total, SUM(CASE WHEN q.status='dead' THEN 1 ELSE 0 END) AS dead,
    ${terminalCountSql}, SUM(CASE WHEN q.status IN ('ready','leased') THEN 1 ELSE 0 END) AS active
    FROM pdf_recovery_ledger l JOIN enrichment_queue q
      ON l.lane='enrichment' AND q.candidate_id=l.candidate_id
    GROUP BY l.batch_id,l.lane
    UNION ALL
    SELECT l.batch_id,l.lane,MIN(l.released_at),COUNT(*),
    SUM(CASE WHEN q.status='dead' THEN 1 ELSE 0 END),
    ${terminalCountSql}, SUM(CASE WHEN q.status IN ('ready','leased') THEN 1 ELSE 0 END)
    FROM pdf_recovery_ledger l JOIN classification_queue q
      ON l.lane='classification' AND q.candidate_id=l.candidate_id
    GROUP BY l.batch_id,l.lane
    ORDER BY released_at DESC LIMIT 1`);
  if (previous.length) {
    const last = previous[0];
    // Expected terminal extraction failures are quarantined and audited, not
    // counted as signs of a broken replay engine. Timeouts/unknowns still are.
    const unexpectedDead = Math.max(0, Number(last.dead || 0) - Number(last.terminal_dead || 0));
    if (unexpectedDead >= 4) return {status:'paused_failure_threshold',unexpected_dead:unexpectedDead,previous:last};
    if (Number(last.active) > 0) return {status:'paused_active_batch',previous:last};
    if (now.getTime() - Date.parse(last.released_at) < MIN_INTERVAL_MS)
      return {status:'paused_cadence',previous:last};
  }

  // Keep existing queue traffic healthy; never starve live classification or enrichment.
  const queues = await first(db, `SELECT
    (SELECT COUNT(*) FROM enrichment_queue WHERE status='ready') AS enrich_ready,
    (SELECT COUNT(*) FROM enrichment_queue WHERE status='leased') AS enrich_leased,
    (SELECT COUNT(*) FROM classification_queue WHERE status='ready') AS class_ready,
    (SELECT COUNT(*) FROM classification_queue WHERE status='leased') AS class_leased,
    (SELECT COUNT(*) FROM enrichment_queue WHERE status='leased' AND lease_until<=?) AS enrich_expired,
    (SELECT COUNT(*) FROM classification_queue WHERE status='leased' AND lease_until<=?) AS class_expired`, timestamp,timestamp);
  if (Number(queues.enrich_expired) > 5 || Number(queues.class_expired) > 5)
    return {status:'paused_expired_leases'};
  const counts = {};
  for (const lane of ['enrichment','classification']) {
    const row = await first(db, `SELECT COUNT(*) AS count FROM ${TABLES[lane]} q
      LEFT JOIN pdf_recovery_ledger l ON l.lane=? AND l.candidate_id=q.candidate_id
      WHERE q.status='dead' AND ${LEGACY_PDF} AND l.candidate_id IS NULL`,lane);
    counts[lane] = Number(row?.count || 0);
  }
  const lane = counts.enrichment ? 'enrichment' : counts.classification ? 'classification' : null;
  if (!lane) return {status:'complete',remaining:counts};
  if ((lane==='enrichment' && (Number(queues.enrich_ready)>60 || Number(queues.enrich_leased)>24)) ||
      (lane==='classification' && (Number(queues.class_ready)>70 || Number(queues.class_leased)>24)))
    return {status:'paused_busy',lane,remaining:counts};

  const table=TABLES[lane];
  const batchId='cf-'+now.toISOString();
  // A single SQL statement claims at most 25 fresh rows; the ledger's unique
  // candidate key prevents duplicate release by overlapping operator attempts.
  await db.prepare(`INSERT OR IGNORE INTO pdf_recovery_ledger(lane,candidate_id,batch_id,released_at)
    SELECT ?,q.candidate_id,?,? FROM ${table} q
    LEFT JOIN pdf_recovery_ledger l ON l.lane=? AND l.candidate_id=q.candidate_id
    WHERE q.status='dead' AND ${LEGACY_PDF} AND l.candidate_id IS NULL
    ORDER BY q.updated_at,q.candidate_id LIMIT ?`)
    .bind(lane,batchId,timestamp,lane,BATCH_LIMIT).run();
  const selected=await first(db,`SELECT COUNT(*) AS count FROM pdf_recovery_ledger
    WHERE lane=? AND batch_id=?`,lane,batchId);
  const count=Number(selected?.count || 0);
  if (!count) return {status:'no_new_rows',lane};
  const released=await db.prepare(`UPDATE ${table}
    SET status='ready', attempts=0, available_at=?, lease_until=NULL,
      last_error=NULL, updated_at=?
    WHERE status='dead'
      AND instr(last_error,'findpitches_v2_fetch_content_type_unsupported:')=1
      AND instr(lower(last_error),'pdf')>0
      AND candidate_id IN
        (SELECT candidate_id FROM pdf_recovery_ledger WHERE lane=? AND batch_id=?)`)
    .bind(timestamp,timestamp,lane,batchId).run();
  const changes=Number(released.meta?.changes ?? 0);
  if (changes!==count) throw new Error(`pdf_replay_claim_mismatch:${changes}/${count}`);
  return {status:'released',lane,batch_id:batchId,released:changes,remaining_before:counts};
}
