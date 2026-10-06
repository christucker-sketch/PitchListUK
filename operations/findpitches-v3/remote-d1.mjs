// Operator tooling only. Always verifies the target is the separate V3 shadow database.
export async function openRemoteD1(api,state) {
  if(api.account!==state.account_id)throw new Error('cloudflare_account_mismatch');
  const database=await api.accountRequest('/d1/database/'+state.database_id);
  if(database.name!=='findpitches-v3-shadow')throw new Error('v3_shadow_database_required');
  async function execute(query,params=[]) {
    const rows=await api.accountRequest('/d1/database/'+state.database_id+'/query',{method:'POST',body:{sql:query,params}});
    if(!rows[0]?.success)throw new Error('remote_d1_query_failed');return rows[0];
  }
  function statement(query,params=[]) {
    return {bind:(...args)=>statement(query,args),run:()=>execute(query,params),all:()=>execute(query,params),first:async()=>((await execute(query,params)).results??[])[0]??null};
  }
  return {prepare:query=>statement(query)};
}
