import test from 'node:test';
import assert from 'node:assert/strict';
import { getCatalogueCoverageAudit } from '../../platform/findpitches-v2/quality/catalogue-coverage-audit.mjs';

test('audit reports every US state, including zero-coverage states, without calling projections customer-ready', async () => {
  const sqls = [];
  const db = {prepare(sql) {
    sqls.push(sql);
    if (sql.includes("WHERE c.market='US'")) return {all:async()=>({results:[
      {region_code:'CA',candidates:50,validated:12,rejected:31,validated_with_current_enrichment:9,
        validated_without_current_enrichment:3,projected_validated:8,current_source_backed_projection:4},
      {region_code:'BAD',candidates:2}
    ]})};
    if (sql.includes("WHERE status IN ('rejected','held')")) return {all:async()=>({results:[
      {market:'US',status:'rejected',reason:'classification:irrelevant',records:20}
    ]})};
    return {all:async()=>({results:[
      {market:'US',validated:12,with_current_enrichment:9,missing_current_enrichment:3,current_source_backed_projection:4}
    ]})};
  }};
  const report = await getCatalogueCoverageAudit(db);
  assert.equal(sqls.length,3);
  assert.equal(report.us_states.length,50);
  assert.equal(report.us_states.find(s=>s.code==='CA').current_source_backed_projection,4);
  assert.equal(report.us_states.find(s=>s.code==='WY').candidates,0);
  assert.deepEqual(report.unknown_region,[{region_code:'BAD',candidates:2}]);
  assert.equal(report.rejection_reasons[0].records,20);
  assert.equal(report.validated_recovery_by_market[0].missing_current_enrichment,3);
  assert.match(report.definitions.current_source_backed_projection,/NOT.*visibility count/);
  assert.match(report.definitions.state_geography,/not independently verified/i);
});

test('audit does not write to D1 and rejects a missing database', async () => {
  await assert.rejects(getCatalogueCoverageAudit(null),/db_missing/);
  const db={prepare(sql) {
    assert.match(sql,/^SELECT /);
    return {all:async()=>({results:[]})};
  }};
  const report=await getCatalogueCoverageAudit(db);
  assert.equal(report.us_states.length,50);
  assert.equal(report.us_states.every(s=>s.current_source_backed_projection===0),true);
  assert.deepEqual(report.rejection_reasons,[]);
});
