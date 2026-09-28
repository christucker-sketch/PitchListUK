import test from 'node:test';
import assert from 'node:assert/strict';
import {runObservedPdfRecovery,getPdfRecoveryTelemetry} from '../../platform/findpitches-v2/pdf-recovery/telemetry.mjs';

function db(){
  const values=new Map();
  return {values,prepare(sql){
    return {bind(...args){this.args=args;return this;},async run(){
      assert.ok(sql.includes('runtime_meta'));
      values.set(this.args[0],{value:this.args[1],updated_at:this.args[2]});
      return {meta:{changes:1}};
    },async first(){return values.get(this.args[0])??null;}};
  }};
}
test('persist heartbeat before recovery, then released count and batch ID',async()=>{
  const database=db();
  const result=await runObservedPdfRecovery(database,async()=>{
    const running=await getPdfRecoveryTelemetry(database);
    assert.equal(running.outcome,'started');
    assert.equal(running.cron,'7,22,37,52 * * * *');
    return {status:'released',lane:'enrichment',released:25,batch_id:'cf-test'};
  },{now:new Date('2026-09-28T19:37:00Z'),cron:'7,22,37,52 * * * *'});
  assert.equal(result.released,25);
  const last=await getPdfRecoveryTelemetry(database);
  assert.equal(last.outcome,'released');
  assert.equal(last.released,25);
  assert.equal(last.batch_id,'cf-test');
});
test('record paused reason and errors without losing heartbeat',async()=>{
 const database=db();
 await runObservedPdfRecovery(database,async()=>({status:'paused_active_batch',previous:{active:1}}));
 assert.equal((await getPdfRecoveryTelemetry(database)).outcome,'paused_active_batch');
 await assert.rejects(()=>runObservedPdfRecovery(database,async()=>{throw new Error('sqlite probe failed');}));
 const last=await getPdfRecoveryTelemetry(database);
 assert.equal(last.outcome,'error');
 assert.equal(last.error,'sqlite probe failed');
});
test('status is null before first tick',async()=>assert.equal(await getPdfRecoveryTelemetry(db()),null));
