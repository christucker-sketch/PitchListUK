import {US_MAJOR_CITIES} from '../../../operations/findpitches-v2/us-major-cities-manifest.mjs';
import {enabledGeographies} from './catalog.mjs';

// FIPS states covered by the independent, SHA-pinned Census import.
const STATE_BY_FIPS=Object.freeze({
 '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT',
 '10':'DE','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN',
 '19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA',
 '26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV',
 '33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH',
 '40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN',
 '48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY'
});
const cleanName=name=>String(name).replace(/\s+(?:city|town|municipality|village)$/i,'').trim()
 .replace(/^San Buenaventura \(Ventura\)$/,'Ventura');
const slug=name=>name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

// Pure all-major-city planning. Keep the already-deployed eight-city pilot IDs
// identical so INSERT OR IGNORE never duplicates work. Distinct Census GEOIDs
// remain available for future verified venue matching, not inferred from searches.
export function planAllMajorUsCityJobs({now=new Date(),spacingMinutes=15}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Number.isInteger(spacingMinutes)||spacingMinutes<5||spacingMinutes>120){
  throw new Error('major_city_bad_bounds');
 }
 const states=new Set(enabledGeographies('US').map(x=>x.code));
 const groups=new Map();
 const seenGeoids=new Set(),seenIds=new Set();
 for(const place of US_MAJOR_CITIES){
  const geoid=String(place.geoid);
  const state=STATE_BY_FIPS[geoid.slice(0,2)];
  if(!/^\d{7}$/.test(geoid)||!state||!states.has(state)||seenGeoids.has(geoid)){
   throw new Error('major_city_invalid_geoid_or_state');
  }
  seenGeoids.add(geoid);
  const name=cleanName(place.name);
  const id='city:US:'+state+':'+slug(name);
  if(!name||seenIds.has(id))throw new Error('major_city_duplicate_search_identity');
  seenIds.add(id);
  if(!groups.has(state))groups.set(state,[]);
  groups.get(state).push({id,geoid,state,name,location:name+' '+state});
 }
 if(seenGeoids.size!==314)throw new Error('major_city_manifest_incomplete');
 // Each state receives one opportunity before second cities are considered.
 // Do not invent a >100k incorporated city for the six states with none.
 const ordered=[],remaining=[...groups].sort(([a],[b])=>a.localeCompare(b));
 for(let i=0;ordered.length<314;i++){
  for(const [,cities] of remaining)if(cities[i])ordered.push(cities[i]);
 }
 return Object.freeze(ordered.map((x,i)=>Object.freeze({
  ...x,market:'US',region_code:x.state,query_group:1,priority:0,
  status:'ready',available_at:new Date(now.getTime()+i*spacingMinutes*60000).toISOString()
 })));
}
export const US_MAJOR_CITY_GEOGRAPHY='2025 Census Gazetteer / 2020 decennial population >=100000';
