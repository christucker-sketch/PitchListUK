import test from 'node:test';
import assert from 'node:assert/strict';
import {extractOnlyWorkerModule,patchRecheckQuery,sha256,LEGACY_RECHECK_PAGE_SQL,LEGACY_RECHECK_COUNT_SQL} from '../../operations/findpitches-v3/prepare-recheck-query-patch.mjs';
import {PRODUCER_RECHECK_PAGE_SQL,PRODUCER_RECHECK_COUNT_SQL} from '../../platform/findpitches-v3/recheck-query.mjs';
const source='// exact deployed prefix\nconst query=`'+LEGACY_RECHECK_PAGE_SQL+'`;\nconst count=`'+LEGACY_RECHECK_COUNT_SQL+'`;\n// exact deployed suffix\n';
const wire=s=>'--abc123def456\r\nContent-Disposition: form-data; name="worker.js"\r\n\r\n'+s+'\r\n--abc123def456--\r\n';
test('multipart extraction preserves exact Worker source bytes including the trailing newline',()=>{
 assert.deepEqual(extractOnlyWorkerModule(wire(source)),{name:'worker.js',source});
});
test('only the two SQL literals change; all other worker code stays byte-identical',()=>{
 const r=patchRecheckQuery(source,sha256(source));
 assert.equal(r.source,'// exact deployed prefix\nconst query=`'+PRODUCER_RECHECK_PAGE_SQL+'`;\nconst count=`'+PRODUCER_RECHECK_COUNT_SQL+'`;\n// exact deployed suffix\n');
 assert.equal(r.manifest.replacementCount,2);assert.equal(r.manifest.uploaded,false);assert.equal(r.manifest.deployed,false);
});
test('hash drift, missing target and ambiguous repeated SQL sites fail closed',()=>{
 assert.throws(()=>patchRecheckQuery(source,'0'.repeat(64)),/hash mismatch/);
 assert.throws(()=>patchRecheckQuery('changed',sha256('changed')),/one original/);
 assert.throws(()=>patchRecheckQuery(source+source,sha256(source+source)),/one original/);
});
test('multiple modules or altered multipart framing are refused',()=>{
 assert.throws(()=>extractOnlyWorkerModule(wire(source).replace('--abc123def456--','--abc123def456\r\nContent-Disposition: form-data; name="extra.js"\r\n\r\nx\r\n--abc123def456--')),/one Worker/);
 assert.throws(()=>extractOnlyWorkerModule('not multipart'),/boundary/);
});
