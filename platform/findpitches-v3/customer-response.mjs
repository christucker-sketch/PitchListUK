import {budgetDay} from './serper-usage.mjs';

// Reuse only the anonymous public data already proved for this HTML response.
// This is not storage or a cache: signed-in reads always use the live API.
export function seoResponseData({path,page,rows,now}) {
  const created=Date.parse(now),source=Date.parse(page.as_of);
  if(!Number.isFinite(created)||!Number.isFinite(source)||source>created+1000)return null;
  let expires=Math.min(created+10000,source+10000);
  for(const row of rows){
    const proof=Date.parse(row._proof?.expires_at);if(!Number.isFinite(proof))return null;
    expires=Math.min(expires,proof);
    if(row.application.closes_at)expires=Math.min(expires,Date.parse(row.application.closes_at));
  }
  if(!Number.isFinite(expires)||expires<=created)return null;
  return {schema:'findpitches-v3-anonymous-seo-response-v1',path,created_at:now,
    expires_at:new Date(expires).toISOString(),london_day:budgetDay(now),page};
}
