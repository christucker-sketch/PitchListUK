const MAX_ATTEMPTS = 5;

import { getMarket } from '../markets/registry.mjs';
import { createDefaultCandidateEvaluator } from '../engine/evaluator.mjs';
import { isTerminalPdfError } from '../providers/fetch/pdf-error-policy.mjs';
import { sourceDomain } from '../acquisition/storage.mjs';

export async function runClassificationBatch(db, {
  fetchProvider,
  limit = 12,
  now = new Date()
} = {}) {
  if (!db?.prepare) throw new Error('findpitches_v2_classifier_db_missing');
  const evaluator = createDefaultCandidateEvaluator({ fetchProvider });
  const timestamp = now.toISOString();
  const leaseUntil = new Date(now.getTime() + 4 * 60 * 1000).toISOString();

  await db.prepare("UPDATE classification_queue SET status='dead',lease_until=NULL,updated_at=? WHERE attempts>=? AND status IN ('ready','leased')").bind(timestamp,MAX_ATTEMPTS).run();

  const ready = await db.prepare(
    `SELECT q.candidate_id, c.market, c.region_code, c.canonical_url, c.event_name,
            c.geography_json, c.evidence_json
       FROM classification_queue q
       JOIN candidates c ON c.id = q.candidate_id
      WHERE (q.status = 'ready' AND q.available_at <= ?)
         OR (q.status = 'leased' AND q.lease_until <= ?)
      ORDER BY q.available_at ASC, q.candidate_id ASC
      LIMIT ?`
  ).bind(timestamp, timestamp, Math.max(1, Math.min(Number(limit) || 12, 50))).all();

  const rows = Array.isArray(ready?.results) ? ready.results : [];
  const outcomes = { processed: 0, validated: 0, held: 0, rejected: 0, failed: 0 };

  for (const row of rows) {
    const claim = await db.prepare(
      `UPDATE classification_queue
          SET status = 'leased', lease_until = ?, attempts = attempts + 1, updated_at = ?
        WHERE candidate_id = ?
          AND ((status = 'ready' AND available_at <= ?)
            OR (status = 'leased' AND lease_until <= ?))`
    ).bind(leaseUntil, timestamp, row.candidate_id, timestamp, timestamp).run();

    if (Number(claim?.meta?.changes || 0) !== 1) continue;

    try {
      const geography = parseJson(row.geography_json);
      const evaluated = await evaluator({
        market: getMarket(row.market),
        region_code: row.region_code,
        location: geography.discovery_location || geography.region || row.region_code,
        result: { url: row.canonical_url, title: row.event_name }
      });

      const priorEvidence=parseJsonArray(row.evidence_json);
      const mergedEvidence=mergeEvidence(priorEvidence,evaluated.evidence || []);
      await db.prepare(
        `UPDATE candidates
            SET region_code = ?, application_url = ?, event_name = ?, organiser = ?,
                geography_json = ?, evidence_json = ?, score = ?, status = ?,
                rejection_reason = ?, last_checked = ?
          WHERE id = ?`
      ).bind(
        evaluated.geography?.region_code || row.region_code,
        evaluated.application_url,
        evaluated.event_name,
        evaluated.organiser,
        JSON.stringify(evaluated.geography || {}),
        JSON.stringify(mergedEvidence),
        Number(evaluated.score || 0),
        evaluated.status,
        evaluated.rejection_reason,
        new Date().toISOString(),
        row.candidate_id
      ).run();

      await db.prepare(
        `UPDATE classification_queue
            SET status = 'complete', lease_until = NULL, last_error = NULL, updated_at = ?
          WHERE candidate_id = ?`
      ).bind(new Date().toISOString(), row.candidate_id).run();

      await recordSourceOutcome(db, row.market, row.canonical_url, evaluated.status, new Date().toISOString());
      await recordSourceRouteOutcome(db, row.candidate_id, evaluated.status, new Date().toISOString());

      outcomes.processed += 1;
      if (evaluated.status === 'validated') outcomes.validated += 1;
      else if (evaluated.status === 'held') outcomes.held += 1;
      else outcomes.rejected += 1;
    } catch (error) {
      const retryAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await db.prepare(
        `UPDATE classification_queue
            SET status = ?, available_at = ?, lease_until = NULL,
                last_error = ?, updated_at = ?
          WHERE candidate_id = ?`
      ).bind(
        isTerminalPdfError(error) || Number(row.attempts || 0) + 1 >= MAX_ATTEMPTS ? 'dead' : 'ready',
        retryAt,
        String(error?.message || error).slice(0, 500),
        new Date().toISOString(),
        row.candidate_id
      ).run();
      outcomes.failed += 1;
    }
  }

  return Object.freeze(outcomes);
}

function parseJson(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}


function parseJsonArray(value) {
  try {
    const parsed=JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function mergeEvidence(prior,next) {
  const out=[],seen=new Set();
  for(const item of [...(Array.isArray(prior)?prior:[]),...(Array.isArray(next)?next:[])]){
    if(!item||typeof item!=='object')continue;
    const key=JSON.stringify([
      item.kind||null,item.source||item.url||null,item.title||null,
      item.snippet||item.excerpt||null,item.query_id||null,item.query||null
    ]);
    if(seen.has(key))continue;
    seen.add(key);out.push(item);
  }
  return out;
}


async function recordSourceOutcome(db, market, sourceUrl, status, timestamp) {
  const domain = sourceDomain(sourceUrl);
  if (!domain) return;
  const validated = status === 'validated';
  const rejected = status === 'rejected';
  if (!validated && !rejected) return;

  await db.prepare(
    `UPDATE source_reputation
        SET last_seen = ?,
            last_success = CASE WHEN ? = 1 THEN ? ELSE last_success END,
            rejection_count = rejection_count + ?,
            reputation_score = CASE
              WHEN candidate_count <= 0 THEN 0
              ELSE MAX(0, MIN(100,
                100.0 * (candidate_count - rejection_count - ?) / candidate_count
              ))
            END
      WHERE market = ? AND domain = ?`
  ).bind(
    timestamp,
    validated ? 1 : 0,
    timestamp,
    rejected ? 1 : 0,
    rejected ? 1 : 0,
    market,
    domain
  ).run();
}


async function recordSourceRouteOutcome(db, candidateId, status, timestamp) {
  const row=await db.prepare('SELECT geography_json FROM candidates WHERE id=?').bind(candidateId).first();
  let geography={};
  try { geography=JSON.parse(row?.geography_json||'{}'); } catch {}
  const route=String(geography?.source_route||'').trim();
  if(!route)return;
  const validated=status==='validated';
  const rejected=status==='rejected';
  if(!validated&&!rejected)return;
  await db.prepare(
    `UPDATE source_routes
        SET last_seen=?,
            candidate_count=candidate_count+1,
            rejection_count=rejection_count+?,
            reputation_score=CASE
              WHEN candidate_count+1<=0 THEN 0
              ELSE 100.0*(candidate_count+1-(rejection_count+?))/(candidate_count+1)
            END
      WHERE market=(SELECT market FROM candidates WHERE id=?) AND route_url=?`
  ).bind(timestamp,rejected?1:0,rejected?1:0,candidateId,route).run();
}
