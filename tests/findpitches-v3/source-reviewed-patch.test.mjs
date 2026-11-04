import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {freezeReviewedSource,requireReviewedRecheckIndex} from '../../operations/findpitches-v3/release-source-worker.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const fixture=()=>{const d=fs.mkdtempSync(path.join(tmpdir(),'v3-reviewed-')),sourceFile=path.join(d,'patch.mjs');fs.writeFileSync(sourceFile,'export default {};\n');return{d,sourceFile,expectedSourceSha256:hash('export default {};\n'),expectedActiveVersion:'pinned',activeVersion:'pinned',role:'ingest',outputDirectory:path.join(d,'out')};};
test('freeze uses the exact reviewed bytes and cannot be redirected by later source edits',()=>{
 const x=fixture();try{const frozen=freezeReviewedSource(x);fs.writeFileSync(x.sourceFile,'changed');assert.equal(fs.readFileSync(frozen,'utf8'),'export default {};\n');assert.throws(()=>freezeReviewedSource({...x,expectedSourceSha256:hash('changed')}),/EEXIST/);}finally{fs.rmSync(x.d,{recursive:true,force:true});}
});
test('role, active version and content hash drift are refused before a source release',()=>{
 const x=fixture();try{assert.throws(()=>freezeReviewedSource({...x,role:'api'}),/reviewed_ingest/);assert.throws(()=>freezeReviewedSource({...x,activeVersion:'new'}),/active_version/);assert.throws(()=>freezeReviewedSource({...x,expectedSourceSha256:'0'.repeat(64)}),/hash_mismatch/);}finally{fs.rmSync(x.d,{recursive:true,force:true});}
});
test('source symlink is refused and the default release path remains opt-in',()=>{
 const x=fixture();try{const link=path.join(x.d,'link');fs.symlinkSync(x.sourceFile,link);assert.throws(()=>freezeReviewedSource({...x,sourceFile:link}),/ELOOP/);assert.equal(freezeReviewedSource({}),null);}finally{fs.rmSync(x.d,{recursive:true,force:true});}
});
test('an existing wrong index cannot satisfy the reviewed-source release prerequisite',()=>{
 const ddl=fs.readFileSync(new URL('../../operations/findpitches-v3/migrations/0028_structured_recheck_lookup.sql',import.meta.url),'utf8');
 assert.doesNotThrow(()=>requireReviewedRecheckIndex(ddl.replace('IF NOT EXISTS ','')));
 assert.throws(()=>requireReviewedRecheckIndex(undefined),/index_definition/);
 assert.throws(()=>requireReviewedRecheckIndex(ddl.replace('id,producer_record_id,market','id,producer_record_id')),/index_definition/);
 assert.throws(()=>requireReviewedRecheckIndex(ddl.replace("validation_status='accepted'","validation_status='rejected'")),/index_definition/);
 assert.throws(()=>requireReviewedRecheckIndex(ddl.replace("'$.last_checked'","'$.LAST_CHECKED'")),/index_definition/);
 assert.throws(()=>requireReviewedRecheckIndex(ddl.replace("'shadow'","'SHADOW'")),/index_definition/);
 assert.throws(()=>requireReviewedRecheckIndex(ddl.replace("'accepted'","' accepted '")),/index_definition/);
});
