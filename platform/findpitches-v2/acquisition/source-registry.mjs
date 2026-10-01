import { sourceDomain } from './storage.mjs';

export async function seedSourceRoutesFromValidated(db, { market='US', limit=250, now=new Date() }={}) {
  if(!db?.prepare) throw new Error('findpitches_v2_source_seed_db_missing');
  const rows=await db.prepare(
    `SELECT canonical_url, application_url, organiser
       FROM candidates
      WHERE market=? AND status='validated'
      ORDER BY last_checked DESC
      LIMIT ?`
  ).bind(market,Math.max(1,Math.min(Number(limit)||250,1000))).all();
  const timestamp=now.toISOString();
  let inserted=0;
  for(const row of rows?.results||[]){
    for(const value of [row.application_url,row.canonical_url]){
      if(!value)continue;
      const domain=sourceDomain(value);
      if(!domain)continue;
      const r=await db.prepare(
        `INSERT OR IGNORE INTO source_routes (
          market, route_url, domain, organisation, route_type, status,
          first_seen, last_seen, last_checked, next_check, refresh_minutes,
          candidate_count, usable_count, rejection_count, reputation_score,
          discovery_method
        ) VALUES (?, ?, ?, ?, 'unknown', 'discovered', ?, ?, NULL, ?, 10080, 1, 0, 0, 0, 'validated_seed')`
      ).bind(market,value,domain,row.organiser||null,timestamp,timestamp,timestamp).run();
      inserted+=Number(r?.meta?.changes||0);
    }
  }
  return Object.freeze({market,scanned:(rows?.results||[]).length,inserted});
}
