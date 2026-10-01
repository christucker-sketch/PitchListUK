#!/usr/bin/env node
// Bounded, read-only production D1 audit. Raw evidence output is private and
// must not be committed. Required env: CLOUDFLARE_ACCOUNT_ID,
// CLOUDFLARE_API_TOKEN, FINDPITCHES_D1_DATABASE_ID.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getCatalogueCoverageAudit } from '../../../platform/findpitches-v2/quality/catalogue-coverage-audit.mjs';
import {
  getUsCustomerVisibleAuditInventory,
  getUsCustomerVisibleSnapshot
} from '../../../platform/findpitches-v2/quality/us-customer-visible-snapshot.mjs';

const output = process.argv[2];
if (!output) throw new Error('Usage: run-us-customer-visible-audit.mjs <private-output.json>');
const account = required('CLOUDFLARE_ACCOUNT_ID');
const token = required('CLOUDFLARE_API_TOKEN');
const database = required('FINDPITCHES_D1_DATABASE_ID');
const db = d1Adapter({account,token,database});
const now = new Date();
const [catalogue,snapshot,inventory] = await Promise.all([
  getCatalogueCoverageAudit(db),
  getUsCustomerVisibleSnapshot(db,{now,pageSize:100}),
  getUsCustomerVisibleAuditInventory(db,{now,pageSize:100})
]);
if (snapshot.counts.customer_visible !== inventory.visible.length ||
    snapshot.counts.readiness_rejected !== inventory.readiness_rejected.length) {
  throw new Error('findpitches_us_audit_snapshot_inventory_mismatch');
}
const result={snapshot_at:now.toISOString(),database_id:database,catalogue,snapshot,inventory};
await writeFile(resolve(output),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({output:resolve(output),snapshot_at:result.snapshot_at,
  customer_visible:snapshot.counts.customer_visible,
  readiness_rejected:snapshot.counts.readiness_rejected}));

function required(name){const value=String(process.env[name]||'').trim();if(!value)throw new Error('Missing '+name);return value;}
function d1Adapter({account,token,database}) {
  return {prepare(sql){
    if (!/^\s*(SELECT|WITH)\b/i.test(sql) || /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(sql)) {
      throw new Error('findpitches_us_audit_non_read_only_sql');
    }
    let params=[];
    return {bind(...values){params=values;return this;},async all(){
      const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/${encodeURIComponent(database)}/query`,{
        method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
        body:JSON.stringify({sql,params})
      });
      const payload=await response.json();
      if(!response.ok || !payload?.success || !payload?.result?.[0]?.success){
        throw new Error('findpitches_us_audit_d1_query_failed:'+response.status+':'+JSON.stringify(payload?.errors||payload?.result?.[0]?.error||null));
      }
      return {results:payload.result[0].results||[]};
    }};
  }};
}
