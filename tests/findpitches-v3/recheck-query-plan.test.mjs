import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {PRODUCER_RECHECK_PAGE_SQL as fixed} from '../../platform/findpitches-v3/recheck-query.mjs';
import {producerRechecks} from '../../platform/findpitches-v3/rechecks.mjs';
import {FAILED_PAGE_SQL} from './fixtures/recheck-page-failed-2026-11-04.mjs';
const before = "SELECT q.entity_id,q.requested_at,q.reason,r.producer_record_id,r.market,r.environment,\n    MAX(json_extract(r.normalized_json,'$.last_checked')) AS latest_accepted_source_check\n    FROM recheck_requests q JOIN entity_records er ON er.entity_id=q.entity_id JOIN producer_records r ON r.id=er.record_id\n    WHERE r.producer_name='independent-structured' AND r.environment='shadow' AND r.validation_status='accepted' AND (q.requested_at>? OR (q.requested_at=? AND (q.entity_id>? OR (q.entity_id=? AND r.producer_record_id>?))))\n    GROUP BY q.entity_id,q.requested_at,q.reason,r.producer_record_id,r.market,r.environment\n    ORDER BY q.requested_at,q.entity_id,r.producer_record_id LIMIT ?";
const schema = `
CREATE TABLE recheck_requests(entity_id TEXT PRIMARY KEY,requested_at TEXT NOT NULL,reason TEXT);
CREATE TABLE entity_records(record_id TEXT NOT NULL,entity_id TEXT NOT NULL,PRIMARY KEY(record_id,entity_id));
CREATE INDEX entity_records_entity ON entity_records(entity_id,record_id);
CREATE TABLE producer_records(id TEXT PRIMARY KEY,producer_name TEXT,producer_record_id TEXT,environment TEXT,market TEXT,normalized_json TEXT,validation_status TEXT);
CREATE INDEX producer_environment ON producer_records(environment,producer_name);
CREATE INDEX structured_customer_policy_lookup ON producer_records(
 producer_record_id,COALESCE(json_extract(normalized_json,'$.last_checked'),'') DESC,
 id,json_extract(normalized_json,'$.last_checked')
) WHERE producer_name='independent-structured' AND environment='shadow' AND validation_status='accepted';
`;
const migration=readFileSync(new URL('../../operations/findpitches-v3/migrations/0028_structured_recheck_lookup.sql',import.meta.url),'utf8');
function fixture({history=2}={}) {
 const db=new DatabaseSync(':memory:');db.exec(schema);
 const add=(id,pid,entity,clock,{producer='independent-structured',environment='shadow',market='GB',validation='accepted'}={})=>{
  db.prepare('INSERT INTO producer_records VALUES (?,?,?,?,?,?,?)').run(id,producer,pid,environment,market,JSON.stringify({last_checked:clock,padding:'x'.repeat(2048)}),validation);
  if(entity)db.prepare('INSERT INTO entity_records VALUES (?,?)').run(id,entity);
 };
 db.exec('BEGIN');
 for(let i=0;i<107;i++){
  const e='e'+String(i).padStart(3,'0');db.prepare('INSERT INTO recheck_requests VALUES (?,?,?)').run(e,'2026-11-03T12:00:00Z','watch');
  add('old'+i,'p'+i,e,'2026-11-02T12:00:00Z');
  add('new'+i,'p'+i,e,'2026-11-03T12:00:00Z');
  for(let v=2;v<history;v++)add('history'+v+'-'+i,'p'+i,e,'2026-11-03T11:00:00Z');
 }
 add('second','p-extra','e000','2026-11-04T00:00:00Z');
 add('not-linked','p0',null,'2099-01-01T00:00:00Z');
 add('wrong-producer','p0','e000','2099-01-01T00:00:00Z',{producer:'other'});
 add('test-env','p0','e000','2099-01-01T00:00:00Z',{environment:'test'});
 add('rejected','p0','e000','2099-01-01T00:00:00Z',{validation:'rejected'});
 add('null-clock','p-null','e001',null);
 add('other-market','p0','e000','2026-11-01T00:00:00Z',{market:'US'});
 for(let i=0;i<1200;i++)add('unrelated'+i,'u'+i,'unrequested','2026-01-01T00:00:00Z');
 db.exec('COMMIT');
 db.exec(migration);
 return db;
}
const params=(cursor=['','',''],limit=101)=>[cursor[0],cursor[0],cursor[1],cursor[1],cursor[2],limit];
const rows=(db,q,c,l)=>db.prepare(q).all(...params(c,l)).map(x=>({...x}));
test('page results preserve exact membership, linked MAX clocks, markets and nulls',()=>{
 const db=fixture();try{
  const a=rows(db,before,undefined,501),b=rows(db,fixed,undefined,501);
  assert.deepEqual(b,a);
  assert.equal(b.find(x=>x.entity_id==='e000'&&x.producer_record_id==='p0'&&x.market==='GB').latest_accepted_source_check,'2026-11-03T12:00:00Z');
  assert.equal(b.find(x=>x.producer_record_id==='p-null').latest_accepted_source_check,null);
 }finally{db.close();}
});
test('identical keyset pages, ties and after-last-page results; SELECT changes no data',()=>{
 const db=fixture();try{
  const totalBefore=db.prepare('SELECT total_changes() n').get().n;
  let cursor=['','',''],pages=0;
  for(;;){
   const a=rows(db,before,cursor,17),b=rows(db,fixed,cursor,17);assert.deepEqual(b,a);
   if(!a.length)break;const last=a.at(-1);cursor=[last.requested_at,last.entity_id,last.producer_record_id];
   assert.ok(++pages<20);
  }
  assert.ok(pages>1);assert.equal(db.prepare('SELECT total_changes() n').get().n,totalBefore);
 }finally{db.close();}
});
test('pending-first lookup uses the new covering index without receipt-table column reads or JSON parsing',()=>{
 const db=fixture();try{
  const plan=db.prepare('EXPLAIN QUERY PLAN '+fixed).all(...params()).map(x=>x.detail).join('\n');
  assert.match(plan,/SCAN q/);
  assert.match(plan,/entity_records_entity/);
  assert.match(plan,/SEARCH r USING (?:COVERING )?INDEX structured_recheck_lookup/);
  const ops=q=>db.prepare('EXPLAIN '+q).all(...params()).filter(x=>x.opcode==='Function'&&String(x.p4).includes('json_extract')).length;
  const incidentPlan=before.replace('JOIN producer_records r ON','JOIN producer_records r INDEXED BY producer_environment ON');
  assert.ok(ops(incidentPlan)>0,'negative control: observed environment-first access path parses JSON');
  assert.equal(ops(fixed),0,'expression-index clock values avoid normalized JSON parsing');
  const tableRoot=db.prepare("SELECT rootpage FROM sqlite_master WHERE type='table' AND name='producer_records'").get().rootpage;
  const tableReads=q=>{
   const bytecode=db.prepare('EXPLAIN '+q).all(...params());
   const cursors=new Set(bytecode.filter(x=>x.opcode==='OpenRead'&&x.p2===tableRoot).map(x=>x.p1));
   return bytecode.filter(x=>x.opcode==='Column'&&cursors.has(x.p1)).length;
  };
  assert.ok(tableReads(incidentPlan)>0,'negative control dereferences the wide producer table');
  assert.equal(ops(FAILED_PAGE_SQL),0,'failed candidate already avoided JSON parsing');
  assert.ok(tableReads(FAILED_PAGE_SQL)>0,'but the failed candidate still dereferenced the wide producer table');
  assert.equal(tableReads(fixed),0,'new query reads receipt metadata and clocks from the narrow index only');
 }finally{db.close();}
});
test('missing migration fails closed rather than silently reverting to the overloaded query',()=>{
 const db=fixture();try{
  db.exec('DROP INDEX structured_recheck_lookup');
  assert.throws(()=>rows(db,fixed),/no such index/);
 }finally{db.close();}
});
test('actual producerRechecks entrypoint retains pagination, pending-entity count and cursor validation',async()=>{
 const sqlite=fixture();
 const statements=[];
 const db={prepare(text){statements.push(text);return{bind(...values){return{
  async all(){return {results:sqlite.prepare(text).all(...values)};},
  async first(){return sqlite.prepare(text).get(...values)??null;}
 };}};}};
 try{
  const beforeChanges=sqlite.prepare('SELECT total_changes() n').get().n;
  const a=await producerRechecks(db),b=await producerRechecks(db,{cursor:a.next_cursor});
  assert.equal(a.requests.length,100);assert.equal(b.requests.length,10);
  assert.equal(a.pending_entities,107);assert.equal(b.pending_entities,107);
  assert.equal(b.next_cursor,null);
  const countSql=statements.find(s=>s.startsWith('SELECT COUNT(*) AS n FROM recheck_requests'));
  assert.ok(countSql);
  const countPlan=sqlite.prepare('EXPLAIN QUERY PLAN '+countSql).all().map(r=>r.detail).join('\n');
  assert.match(countPlan,/structured_recheck_lookup/,'the unchanged pending-count query also benefits from the narrow index');
  assert.deepEqual([...a.requests,...b.requests].map(x=>({...x})),rows(sqlite,before,undefined,501));
  await assert.rejects(producerRechecks(db,{cursor:'broken'}),/cursor_invalid/);
  assert.equal(sqlite.prepare('SELECT total_changes() n').get().n,beforeChanges);
 }finally{sqlite.close();}
});
test('growing linked receipt history does not change page membership or latest-clock semantics',()=>{
 const db=fixture({history:32});try{
  assert.deepEqual(rows(db,fixed,undefined,501),rows(db,before,undefined,501));
  assert.equal(rows(db,fixed,undefined,101).length,101);
 }finally{db.close();}
});
test('replaying the same index migration leaves receipt data unchanged',()=>{
 const db=fixture();try{
  const n=db.prepare('SELECT total_changes() n').get().n;
  const a=rows(db,fixed,undefined,501);db.exec(migration);
  assert.deepEqual(rows(db,fixed,undefined,501),a);
  assert.equal(db.prepare('SELECT total_changes() n').get().n,n);
 }finally{db.close();}
});

