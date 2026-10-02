// Operator-only v2 pilot. Namespaced city jobs coexist with the existing
// GB/US/CA acquisition catalogue; no GEOIDs, candidate writes or publication.
// With the current deployed worker these initially run its existing query mode.
// The staged PR adds official-first mode for query_group=1 when deployed.
const PILOT=Object.freeze([
 ['CA','Los Angeles'],['TX','Houston'],['FL','Miami'],['AZ','Phoenix'],
 ['NC','Charlotte'],['WA','Seattle'],['CO','Denver'],['GA','Atlanta']
]);
export function planCityPilotJobs({now=new Date(),spacingMinutes=25}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Number.isInteger(spacingMinutes)||spacingMinutes<15||spacingMinutes>120){
  throw new Error('city_pilot_invalid_bounds');
 }
 return Object.freeze(PILOT.map(([state,city],index)=>Object.freeze({
  id:'city:US:'+state+':'+city.toLowerCase().replace(/[^a-z0-9]+/g,'-'),
  market:'US',region_code:state,location:city+' '+state,query_group:1,
  priority:0,status:'ready',
  available_at:new Date(now.getTime()+index*spacingMinutes*60000).toISOString()
 })));
}
export const CITY_PILOT_MARKETS=Object.freeze(PILOT.map(([state,city])=>state+':'+city));
