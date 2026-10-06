import { hash, stableJson } from './contract.mjs';

export async function jobStatement(db,stage,dedupe,payload,now,availableAt=now) {
  const id='job_'+(await hash([stage,dedupe])).slice(0,32);
  return db.prepare(`INSERT OR IGNORE INTO jobs(id,stage,dedupe_key,payload_json,available_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
    .bind(id,stage,dedupe,stableJson(payload),availableAt,now,now);
}
export async function enqueue(db,stage,dedupe,payload,now=new Date().toISOString(),availableAt=now) {
  return (await jobStatement(db,stage,dedupe,payload,now,availableAt)).run();
}
export async function recoverExpired(db,stage,now) {
  const result=await db.prepare(`UPDATE jobs SET status=CASE WHEN attempts>=max_attempts THEN 'dead' ELSE 'ready' END,
    lease_token=NULL,lease_until=NULL,last_error='expired_lease_recovered',updated_at=?
    WHERE stage=? AND status='leased' AND lease_until<=?`).bind(now,stage,now).run();
  return Number(result.meta?.changes||0);
}
export async function claimJob(db,stage,{now=new Date().toISOString(),leaseMs=240000,jobId=null}={}) {
  await recoverExpired(db,stage,now);
  const token=crypto.randomUUID(),until=new Date(Date.parse(now)+leaseMs).toISOString();
  return db.prepare(`UPDATE jobs SET status='leased',attempts=attempts+1,lease_token=?,lease_until=?,updated_at=?
    WHERE id=(SELECT id FROM jobs WHERE stage=? AND status='ready' AND available_at<=? AND attempts<max_attempts
      AND (? IS NULL OR id=?) ORDER BY available_at,id LIMIT 1)
    AND status='ready' AND attempts<max_attempts RETURNING *`).bind(token,until,now,stage,now,jobId,jobId).first();
}
export async function finishJob(db,job,now=new Date().toISOString()) {
  const result=await db.prepare(`UPDATE jobs SET status='complete',lease_token=NULL,lease_until=NULL,last_error=NULL,updated_at=?
    WHERE id=? AND status='leased' AND lease_token=? AND lease_until>?`).bind(now,job.id,job.lease_token,now).run();
  if(Number(result.meta?.changes)!==1) throw new Error('lease_ownership_lost');
}
export async function heartbeat(db,job,{now=new Date().toISOString(),leaseMs=240000}={}) {
  const until=new Date(Date.parse(now)+leaseMs).toISOString();
  const result=await db.prepare("UPDATE jobs SET lease_until=?,updated_at=? WHERE id=? AND status='leased' AND lease_token=? AND lease_until>?").bind(until,now,job.id,job.lease_token,now).run();
  if(Number(result.meta?.changes)!==1)throw new Error('lease_ownership_lost');
  return until;
}
export async function failJob(db,job,error,now=new Date().toISOString()) {
  const retryAt=new Date(Date.parse(now)+Math.min(3600000,60000*2**Math.min(job.attempts,6))).toISOString();
  return db.prepare(`UPDATE jobs SET status=CASE WHEN attempts>=max_attempts THEN 'dead' ELSE 'ready' END,
    available_at=?,lease_token=NULL,lease_until=NULL,last_error=?,updated_at=? WHERE id=? AND status='leased' AND lease_token=?`)
    .bind(retryAt,String(error?.message||'stage_failed').slice(0,200),now,job.id,job.lease_token).run();
}
export async function requeueDead(db,id,now=new Date().toISOString()) {
  return db.prepare(`UPDATE jobs SET status='ready',attempts=0,available_at=?,lease_token=NULL,lease_until=NULL,last_error=NULL,updated_at=? WHERE id=? AND status='dead'`).bind(now,now,id).run();
}
