// D1-persisted heartbeat for PDF cron investigation. Only the latest tick is
// retained in runtime_meta; no PDF URLs or customer data are logged.
const KEY='last_pdf_recovery_tick';
async function save(db, state) {
  const timestamp=new Date().toISOString();
  await db.prepare(`INSERT INTO runtime_meta(key,value,updated_at) VALUES (?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
    .bind(KEY,JSON.stringify(state),timestamp).run();
}
export async function runObservedPdfRecovery(db, recover, {now=new Date(),cron=null}={}) {
  const started_at=now.toISOString();
  const tick_id=crypto.randomUUID();
  const base={tick_id,cron,started_at};
  // Persist before any queue or ledger query, so an absent heartbeat identifies
  // cron non-delivery rather than an invisible recovery failure.
  await save(db,{...base,outcome:'started',finished_at:null,error:null});
  try {
    const result=await recover(db,{now});
    await save(db,{...base,outcome:result.status,finished_at:new Date().toISOString(),
      lane:result.lane??null,released:result.released??0,
      batch_id:result.batch_id??null,previous:result.previous??null,error:null});
    return result;
  }catch(error){
    const message=String(error?.message||error).slice(0,450);
    await save(db,{...base,outcome:'error',finished_at:new Date().toISOString(),error:message});
    throw error;
  }
}
export async function getPdfRecoveryTelemetry(db) {
  const row=await db.prepare('SELECT value,updated_at FROM runtime_meta WHERE key=?').bind(KEY).first();
  if(!row) return null;
  try {return {...JSON.parse(row.value),updated_at:row.updated_at};}
  catch{return {outcome:'invalid_telemetry',updated_at:row.updated_at};}
}
