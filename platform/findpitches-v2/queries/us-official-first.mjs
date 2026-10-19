// Query profile for city-specific v2 US growth. Acquisition suggestions only:
// no assertion that the event actually occurs in the search city.
const TEMPLATES=Object.freeze([
  ['official-event','{location} festival fair official vendor application'],
  ['official-market','{location} farmers market official become a vendor'],
  ['official-county','{location} county fair vendor exhibitor application'],
  ['official-food','{location} community festival food truck vendor application']
]);
export function buildOfficialFirstUsQueries({location,limit=4,rotation=0}={}){
  const place=String(location||'').trim().replace(/\s+/g,' ');
  if(!place || place.length>120 || !/^[\p{L}\p{N} .,'-]+$/u.test(place))throw new Error('us_city_invalid_location');
  if(!Number.isInteger(limit)||limit<1||limit>4||
      !Number.isInteger(rotation)||rotation<0)throw new Error('us_city_invalid_query_bounds');
  return Object.freeze(Array.from({length:limit},(_,i)=>{
    const [id,template]=TEMPLATES[(rotation+i)%TEMPLATES.length];
    return Object.freeze({template_id:'us-city-'+id,category:'official-first',
      weight:120,query:template.replace('{location}',place)});
  }));
}
