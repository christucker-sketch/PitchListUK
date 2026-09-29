// Seven populous Census place types classified outside ordinary incorporated
// places in the SHA-pinned 2025 geography / 2020 population import.
// These are acquisition SEARCH areas only, never automatic venue GEOIDs.
const SPECIAL=Object.freeze([
 ['1836003','IN','Indianapolis',887642],
 ['4752006','TN','Nashville',689447],
 ['2148006','KY','Louisville',386884],
 ['2146027','KY','Lexington',322570],
 ['1304204','GA','Augusta',202081],
 ['1349008','GA','Macon',157346],
 ['1303440','GA','Athens',127315]
]);
export function planUsSpecialGovernmentCityJobs({now=new Date(),spacingMinutes=15}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Number.isInteger(spacingMinutes)||spacingMinutes<5||spacingMinutes>120){
  throw new Error('special_city_bad_bounds');
 }
 return Object.freeze(SPECIAL.map(([geoid,state,name,population],i)=>Object.freeze({
  geoid,state,name,residents_2020:population,
  id:'city:US:'+state+':'+name.toLowerCase(),
  market:'US',region_code:state,location:name+' '+state,query_group:1,
  status:'ready',priority:0,
  census_type:'large_special_government_review',
  available_at:new Date(now.getTime()+i*spacingMinutes*60000).toISOString()
 })));
}
