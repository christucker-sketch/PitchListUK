import test from 'node:test';
import assert from 'node:assert/strict';
import { runNativePdfRecovery } from '../../platform/findpitches-v2/pdf-recovery/native.mjs';

function fakeDb({prior=[],enrichment=25,classification=569}={}) {
  const calls=[];
  return {
    calls,
    prepare(sql) {
      const statement = {
        bind(...params) { this.params=params; return this; },
        async all() {
          calls.push({type:'all',sql,params:this.params});
          return {results:prior};
        },
        async first() {
          calls.push({type:'first',sql,params:this.params});
          if(sql.includes('AS enrich_ready')) return {enrich_ready:0,enrich_leased:0,class_ready:0,class_leased:0,enrich_expired:0,class_expired:0};
          if(sql.includes('WHERE lane=? AND batch_id=?')) return {count:25};
          if(sql.includes('FROM enrichment_queue q')) return {count:enrichment};
          if(sql.includes('FROM classification_queue q')) return {count:classification};
          throw new Error('Unexpected SQL: '+sql);
        },
        async run() {
          calls.push({type:'run',sql,params:this.params});
          return {meta:{changes:sql.startsWith('UPDATE enrichment_queue')||sql.startsWith('UPDATE classification_queue')?25:1}};
        }
      };
      return statement;
    }
  };
}

test('native replay releases at most 25 legacy enrichment rows and uses instr not LIKE',async()=>{
  const db=fakeDb();
  const result=await runNativePdfRecovery(db,{now:new Date('2026-09-28T18:37:00Z')});
  assert.equal(result.status,'released');
  assert.equal(result.lane,'enrichment');
  assert.equal(result.released,25);
  const claim=db.calls.find(c=>c.sql.includes('INSERT OR IGNORE INTO pdf_recovery_ledger'));
  assert.equal(claim.params.at(-1),25);
  assert.ok(claim.sql.includes('instr(q.last_error'));
  assert.ok(!db.calls.some(c=>/last_error\s+LIKE\s+\?/i.test(c.sql)));
});

test('native replay never releases another batch while previous batch remains active',async()=>{
  const db=fakeDb({prior:[{batch_id:'first',lane:'enrichment',released_at:'2026-09-28T18:00:00Z',total:25,dead:1,active:2}]});
  const result=await runNativePdfRecovery(db,{now:new Date('2026-09-28T18:37:00Z')});
  assert.equal(result.status,'paused_active_batch');
  assert.ok(!db.calls.some(c=>c.sql.includes('INSERT OR IGNORE')));
});

test('native replay respects failure threshold',async()=>{
  const db=fakeDb({prior:[{batch_id:'first',lane:'enrichment',released_at:'2026-09-28T18:00:00Z',total:25,dead:4,active:0}]});
  const result=await runNativePdfRecovery(db,{now:new Date('2026-09-28T18:37:00Z')});
  assert.equal(result.status,'paused_failure_threshold');
  assert.ok(!db.calls.some(c=>c.sql.includes('INSERT OR IGNORE')));
});

test('seven dead rows with five deterministic PDF failures do not block classifier replay',async()=>{
  const db=fakeDb({enrichment:0,classification:519,prior:[{
    batch_id:'cf-class-2',lane:'classification',released_at:'2026-09-29T05:37:00Z',
    total:25,dead:7,terminal_dead:5,active:0
  }]});
  const result=await runNativePdfRecovery(db,{now:new Date('2026-09-29T06:07:00Z')});
  assert.equal(result.status,'released');
  assert.equal(result.lane,'classification');
  assert.equal(result.released,25);
  const sql=db.calls.find(c=>c.type==='all').sql;
  assert.match(sql,/terminal_dead/);
  assert.match(sql,/findpitches_v2_fetch_too_large/);
});

test('four unexpected dead rows still pause recovery even with terminal failures',async()=>{
  const db=fakeDb({prior:[{
    batch_id:'previous',lane:'classification',released_at:'2026-09-29T05:37:00Z',
    total:25,dead:9,terminal_dead:5,active:0
  }]});
  const result=await runNativePdfRecovery(db,{now:new Date('2026-09-29T06:07:00Z')});
  assert.equal(result.status,'paused_failure_threshold');
  assert.equal(result.unexpected_dead,4);
  assert.ok(!db.calls.some(c=>c.sql.includes('INSERT OR IGNORE')));
});

test('unknown failures count towards threshold instead of being silently waived',async()=>{
  const db=fakeDb({prior:[{
    batch_id:'previous',lane:'enrichment',released_at:'2026-09-29T05:37:00Z',
    total:25,dead:4,terminal_dead:0,active:0
  }]});
  const result=await runNativePdfRecovery(db,{now:new Date('2026-09-29T06:07:00Z')});
  assert.equal(result.status,'paused_failure_threshold');
});
