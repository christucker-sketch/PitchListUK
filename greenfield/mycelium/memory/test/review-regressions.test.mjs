import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../src/schema.mjs';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureLocal } from '../scripts/configure-local.mjs';
import { createMemory } from '../src/memory.mjs';

function adapter(pg, failAt = -1) {
  return { query: async (s,p=[]) => (await pg.query(s,p)).rows,
    transaction: ss => pg.transaction(async tx => {
      const out=[]; for(let i=0;i<ss.length;i++) {
        if(i===failAt) throw Error('injected statement failure');
        out.push((await tx.query(ss[i].text,ss[i].values??[])).rows);
      } return out;
    }) };
}
async function fresh() { const pg=new PGlite();const db=adapter(pg); await migrate(db);return {pg,db,m:createMemory(db)}; }
const counts=async db => (await db.query(`SELECT (SELECT count(*) FROM mycelium_memory.nodes)::int AS n,
  (SELECT count(*) FROM mycelium_memory.edges)::int AS e`))[0];

test('R1 runtime bulk INSERT cannot create supersession cycles or forward subject/assessor bypass',async()=>{
  const {pg,db,m}=await fresh();try{
    const subject=await m.appendNode({kind:'subject'}),basis=await m.appendNode({kind:'evidence'});
    await db.query('CREATE ROLE bulk_runtime');
    await db.query('GRANT USAGE ON SCHEMA mycelium_memory TO bulk_runtime');
    await db.query('GRANT SELECT, INSERT ON mycelium_memory.assessments TO bulk_runtime');
    await db.query('SET ROLE bulk_runtime');
    const sql=`INSERT INTO mycelium_memory.assessments(id,node_id,stance,weight,assessor,basis_id,independence_key,supersedes)
      VALUES($1,$3,'supports',0.5,'first',$4,'k',$2),($2,$5,'supports',0.5,$6,$4,'k',$7)`;
    for(const cycle of [true,false]) {
      const a=randomUUID(),b=randomUUID();
      await assert.rejects(db.query(sql,[a,b,subject,basis,cycle?subject:basis,cycle?'first':'other',cycle?a:null]),/must already exist/);
    }
    assert.equal((await db.query('SELECT count(*)::int AS n FROM mycelium_memory.assessments'))[0].n,0);
  }finally{await pg.close();}
});

test('R2 trigger/firing transaction rolls back every failure; due work survives; retries remain idempotent',async()=>{
  const {pg,db,m}=await fresh();try{
    const subject=await m.appendNode({kind:'blocked'}),before=await counts(db);
    await assert.rejects(m.appendRevisitTrigger({target:randomUUID(),predicate:'not_before',params:{at:'2026-01-01Z'}}),/foreign key/);
    assert.deepEqual(await counts(db),before);
    for(const failAt of [0,1,2,3]) {
      await assert.rejects(createMemory(adapter(pg,failAt)).appendRevisitTrigger({target:subject,predicate:'not_before',params:{at:'2026-01-01Z'}}),/injected/);
      assert.deepEqual(await counts(db),before);
    }
    const trigger=await m.appendRevisitTrigger({target:subject,predicate:'not_before',params:{at:'2026-01-01T00:00:00Z'}});
    const due=(await m.dueRevisits('2026-12-01Z')).find(r=>r.trigger===trigger),base=await counts(db);
    for(const failAt of [0,1,2,3,4,5]) {
      await assert.rejects(createMemory(adapter(pg,failAt)).fireRevisit(due),/injected/);
      assert.deepEqual(await counts(db),base);
      assert.ok((await m.dueRevisits('2026-12-01Z')).some(r=>r.trigger===trigger));
    }
    const [a,b]=await Promise.all([m.fireRevisit(due),m.fireRevisit(due)]);assert.equal(a,b);
    assert.equal((await m.dueRevisits('2026-12-01Z')).some(r=>r.trigger===trigger),false);
    const done=await counts(db);
    await assert.rejects(m.fireRevisit({...due,target:randomUUID()}),/different payload/);
    assert.deepEqual(await counts(db),done);
  }finally{await pg.close();}
});

test('R3 exact microsecond cursor and UUID tie break traverse without repeats/skips; R4 depth flag',async()=>{
  const {pg,db,m}=await fresh();try{
    const ids=[];for(let i=0;i<4;i++)ids.push(await m.appendNode({kind:'node'}));
    const edgeIds=[randomUUID(),randomUUID(),randomUUID()].sort();
    for(let i=0;i<3;i++)await db.query(`INSERT INTO mycelium_memory.edges(id,source_id,target_id,relation,recorded_at)
      VALUES($1,$2,$3,'precision',$4)`,[edgeIds[i],ids[0],ids[1],i===0?'2026-10-28T12:00:00.000123Z':'2026-10-28T12:00:00.000456Z']);
    let after=null,found=[];
    for(let i=0;i<4;i++){const page=await m.connections(ids[0],{relation:'precision',limit:1,after});if(!page.length)break;found.push(page[0].id);after=page[0];}
    assert.deepEqual(found,edgeIds);
    await assert.rejects(m.connections(ids[0],{after:{recorded_at:new Date(),id:edgeIds[0]}}),/exact cursor/);
    for(let i=0;i<3;i++)await m.appendEdge({source:ids[i],target:ids[i+1],relation:'chain'});
    assert.equal((await m.neighbourhood(ids[0],{relations:['chain'],maxDepth:1})).depthLimited,true);
    assert.equal((await m.neighbourhood(ids[0],{relations:['chain'],maxDepth:3})).depthLimited,false);
  }finally{await pg.close();}
});

test('redaction removes payloads, preserves topology, is idempotent/audited and unavailable to runtime',async()=>{
  const {pg,db,m}=await fresh();try{
    const n=await m.appendNode({kind:'private-kind',title:'private title',body:'private body',attributes:{private:'metadata'},provenance:{private:'origin'}});
    const basis=await m.appendNode({kind:'evidence'});
    const e=await m.appendEdge({source:n,target:basis,relation:'private-relation',attributes:{private:'edge'},provenance:{private:'edge-origin'}});
    const a=await m.appendAssessment({node:n,stance:'supports',weight:0.5,assessor:'private-assessor',basis,independenceKey:'private-key'});
    await db.query('CREATE ROLE ordinary_runtime');
    await db.query('GRANT USAGE ON SCHEMA mycelium_memory TO ordinary_runtime');
    await db.query('GRANT SELECT,INSERT ON mycelium_memory.nodes,mycelium_memory.edges,mycelium_memory.assessments TO ordinary_runtime');
    await db.query('SET ROLE ordinary_runtime');
    await assert.rejects(db.query('SELECT mycelium_memory.redact($1,$2,$3,$4)',['node',n,'privacy',randomUUID()]),/permission denied/);
    await assert.rejects(db.query("INSERT INTO mycelium_memory.redaction_authorizations VALUES(pg_backend_pid(),txid_current(),'nodes',$1)",[n]),/permission denied/);
    await assert.rejects(db.query("UPDATE mycelium_memory.nodes SET title='bypass' WHERE id=$1",[n]),/permission denied/);
    await db.query('RESET ROLE');
    await db.query('CREATE ROLE privacy_operator');
    await db.query('GRANT USAGE ON SCHEMA mycelium_memory TO privacy_operator');
    await db.query('GRANT EXECUTE ON FUNCTION mycelium_memory.redact(text,uuid,text,uuid) TO privacy_operator');
    const original=await m.getNode(n);
    await db.query('SET ROLE privacy_operator');
    for(const [type,id]of [['node',n],['edge',e],['assessment',a]]) {
      const event=randomUUID();
      const [r]=await db.query('SELECT mycelium_memory.redact($1,$2,$3,$4) AS id',[type,id,'privacy',event]);assert.equal(r.id,event);
      assert.equal((await db.query('SELECT mycelium_memory.redact($1,$2,$3,$4) AS id',[type,id,'privacy',randomUUID()]))[0].id,event);
    }
    await assert.rejects(db.query('SELECT mycelium_memory.redact($1,$2,$3,$4)',['node',basis,'private text',randomUUID()]),/invalid/);
    await db.query('RESET ROLE');
    const redacted=await m.getNode(n);assert.equal(redacted.id,n);assert.equal(redacted.recorded_at.toISOString(),original.recorded_at.toISOString());
    assert.equal(redacted.body,'');assert.equal(redacted.kind,'redacted');assert.deepEqual(redacted.provenance,{});
    const [link]=await db.query('SELECT * FROM mycelium_memory.edges WHERE id=$1',[e]);assert.equal(link.source_id,n);assert.equal(link.target_id,basis);assert.equal(link.relation,'redacted');
    const [assessment]=await db.query('SELECT * FROM mycelium_memory.assessments WHERE id=$1',[a]);assert.equal(assessment.basis_id,basis);assert.equal(assessment.assessor,'redacted');
    assert.deepEqual((await m.belief({node:n})).stances,[]);
    const audit=await db.query('SELECT * FROM mycelium_memory.redactions');assert.equal(audit.length,3);assert.ok(!JSON.stringify(audit).includes('private'));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM mycelium_memory.redaction_authorizations'))[0].n,0);
    await assert.rejects(db.query("UPDATE mycelium_memory.nodes SET title='owner bypass' WHERE id=$1",[n]),/append-only/);
    await assert.rejects(db.query('DELETE FROM mycelium_memory.redactions'),/append-only/);
    await assert.rejects(m.appendNode({id:n,kind:'private-kind',title:'private title',body:'private body',attributes:{private:'metadata'},provenance:{private:'origin'}}),/different payload/);
  }finally{await pg.close();}
});

test('all pending migrations roll back together; exact runtime grants exclude private redaction capability',async()=>{
  const pg=new PGlite();const db=adapter(pg);try{
    await assert.rejects(migrate({...db,transaction:ss=>db.transaction([...ss,{text:'SELECT missing_failure_function()'}])}),/does not exist/);
    assert.equal((await db.query("SELECT to_regnamespace('mycelium_memory')::text AS name"))[0].name,null);
    await migrate(db);
    const source=await readFile(new URL('../sql/runtime_grants.sql',import.meta.url),'utf8');
    await db.transaction(source.split('-- statement').map(text=>({text:text.trim()})).filter(s=>s.text));
    await assert.rejects(db.transaction(source.split('-- statement').map(text=>({text:text.trim()})).filter(s=>s.text)),/already exist/);
    await db.query('SET ROLE mycelium_memory_runtime');const m=createMemory(db);
    const a=await m.appendNode({kind:'runtime-a'}),b=await m.appendNode({kind:'runtime-b'});
    await m.appendEdge({source:a,target:b,relation:'supports'});
    await m.appendAssessment({node:a,basis:b,stance:'supports',weight:0.5,assessor:'runtime',independenceKey:'k'});
    assert.equal((await m.belief({node:a})).stances.length,1);
    await assert.rejects(db.query('SELECT * FROM mycelium_memory.redaction_authorizations'),/permission denied/);
    await assert.rejects(db.query('SELECT mycelium_memory.redact($1,$2,$3,$4)',['node',a,'privacy',randomUUID()]),/permission denied/);
    await db.query('RESET ROLE');
    await db.query('SET ROLE mycelium_memory_redactor');
    await db.query('SELECT mycelium_memory.redact($1,$2,$3,$4)',['node',a,'privacy',randomUUID()]);
    await assert.rejects(db.query('SELECT * FROM mycelium_memory.nodes'),/permission denied/);
    await db.query('RESET ROLE');
    const existing=(await db.query('SELECT id FROM mycelium_memory.redactions'))[0].id;
    await assert.rejects(db.query('SELECT mycelium_memory.redact($1,$2,$3,$4)',['node',b,'privacy',existing]),/duplicate/);
    assert.equal((await m.getNode(b)).kind,'runtime-b');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM mycelium_memory.redaction_authorizations'))[0].n,0);
  }finally{await pg.close();}
});

test('Windows configuration helper accepts captured URI, returns only metadata, refuses overwrite/wrong target',async()=>{
  const root=await mkdtemp(join(tmpdir(),'mycelium-config-'));
  try{
    const file=join(root,'.env.local');
    const value='postgresql://neondb_owner:synthetic-only@ep-synthetic.neon.tech/neondb?sslmode=require';
    await assert.rejects(configureLocal(value.replace('/neondb?','/wrong?'),file),/Invalid target/);
    const metadata=await configureLocal(value+'\r\n',file);
    assert.deepEqual(metadata,{host:'ep-synthetic.neon.tech',database:'neondb',role:'neondb_owner'});
    const saved=await readFile(file,'utf8');assert.ok(saved.includes('MYCELIUM_DATABASE_HOST'));
    await assert.rejects(configureLocal(value,file),/EEXIST/);assert.equal(await readFile(file,'utf8'),saved);
  }finally{await rm(root,{recursive:true,force:true});}
});
