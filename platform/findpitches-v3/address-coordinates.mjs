import {coordinateCountryConsistent,sourceUSState}from'./source-coordinates.mjs';
export const ADDRESS_COORDINATE_POLICY='source-exact-address-coordinate-v1';
export const CENSUS_ENDPOINT='https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const clean=v=>String(v??'').normalize('NFKC').toUpperCase().replace(/[.,]/g,' ').replace(/\s+/g,' ').trim();
const words={STREET:'ST',AVENUE:'AVE',ROAD:'RD',BOULEVARD:'BLVD',DRIVE:'DR',LANE:'LN',COURT:'CT',PLACE:'PL',PARKWAY:'PKWY',HIGHWAY:'HWY',NORTH:'N',SOUTH:'S',EAST:'E',WEST:'W',NORTHEAST:'NE',NORTHWEST:'NW',SOUTHEAST:'SE',SOUTHWEST:'SW',SAINT:'ST',MOUNT:'MT'};
const norm=v=>clean(v).split(' ').map(w=>words[w]??w).join(' ');
export function censusAddressInput(address) {
 if(address?.country!=='US'||!sourceUSState(address.state)||!address.city||!address.street||!/^\d{1,7}\s+[A-Za-z0-9]/.test(address.street)||/\b(?:PO BOX|P O BOX|TBD|TBA|TO BE|INTERSECTION|CORNER OF)\b/i.test(address.street))return null;
 const m=address.street.match(/^(\d{1,7})\s+(.+)$/);if(!m||/\b(?:SUITE|STE|UNIT|APT|FLOOR)\b|#/i.test(m[2]))return null;
 const zip=address.postal_code&&/^\d{5}(?:-\d{4})?$/.test(address.postal_code)?address.postal_code.slice(0,5):null;
 return {country:'US',street:address.street,house_number:Number(m[1]),street_name:norm(m[2]),city:norm(address.city),state:sourceUSState(address.state),zip,
  query:[address.street,address.city,sourceUSState(address.state),zip].filter(Boolean).join(', ')};
}
export function censusRequestURL(address) {
 const input=censusAddressInput(address);if(!input)return null;
 const url=new URL(CENSUS_ENDPOINT);url.search=new URLSearchParams({address:input.query,benchmark:'Public_AR_Current',format:'json'}).toString();return url.href;
}
export function censusPosition(address,document) {
 const input=censusAddressInput(address);if(!input||document?.http_status!==200||document.requested_url!==document.url)return {position:null,reason:'exact_source_address_required'};
 const u=new URL(document.url);if(u.origin+u.pathname!==CENSUS_ENDPOINT||u.searchParams.get('address')!==input.query||u.searchParams.get('benchmark')!=='Public_AR_Current'||u.searchParams.get('format')!=='json')return {position:null,reason:'census_request_not_bound_to_source_address'};
 let data;try{data=JSON.parse(document.json_text);}catch{return {position:null,reason:'census_invalid_json'};}
 const matches=data.result?.addressMatches;if(!Array.isArray(matches)||matches.length!==1)return {position:null,reason:matches?.length?'census_ambiguous_address':'census_no_exact_match'};
 const match=matches[0],c=match.addressComponents??{},street=norm([c.preQualifier,c.preDirection,c.preType,c.streetName,c.suffixType,c.suffixDirection,c.suffixQualifier].filter(Boolean).join(' '));
 if(c.state!==input.state||norm(c.city)!==input.city||street!==input.street_name||input.zip&&input.zip!==c.zip)return {position:null,reason:'census_address_components_disagree'};
 const from=Number(c.fromAddress),to=Number(c.toAddress);if(!/^\d+$/.test(c.fromAddress??'')||!/^\d+$/.test(c.toAddress??'')||input.house_number<Math.min(from,to)||input.house_number>Math.max(from,to)||!/^\d+$/.test(match.tigerLine?.tigerLineId??'')||!['L','R'].includes(match.tigerLine?.side))return {position:null,reason:'census_house_range_not_proved'};
 if(from%2===to%2&&input.house_number%2!==from%2)return {position:null,reason:'census_house_range_parity_disagrees'};
 const lat=match.coordinates?.y,lng=match.coordinates?.x;if(typeof lat!=='number'||typeof lng!=='number'||!coordinateCountryConsistent('US',lat,lng))return {position:null,reason:'census_coordinate_country_disagrees'};
 return {position:{policy:ADDRESS_COORDINATE_POLICY,precision:'address',country:'US',location:address.location,lat,lng,source_url:document.url,method:'census_address_range_match',source_address:address,matched_address:match.matchedAddress,
  tiger_line_id:match.tigerLine.tigerLineId,interpolated:true},reason:null};
}
export function validAddressCoordinates(value,{country,location}={}) {
 if(value?.policy!==ADDRESS_COORDINATE_POLICY||value.precision!=='address'||value.method!=='census_address_range_match'||value.interpolated!==true||country!=='US'||value.country!==country||value.location!==location||!censusAddressInput(value.source_address)||value.source_address.location!==location||!coordinateCountryConsistent(country,value.lat,value.lng))return null;
 try{const u=new URL(value.source_url),input=censusAddressInput(value.source_address);if(u.origin+u.pathname!==CENSUS_ENDPOINT||u.searchParams.get('address')!==input.query||u.searchParams.get('benchmark')!=='Public_AR_Current'||u.searchParams.get('format')!=='json')return null;}catch{return null;}
 return value;
}
export async function fetchCensusPosition(address,{fetcher=fetch,now=new Date().toISOString()}={}) {
 const input=censusAddressInput(address);if(!input)return {position:null,reason:'source_address_not_geocodable',document:null};
 const url=new URL(censusRequestURL(address));
 const document={document_kind:'census_exact_address_receipt',requested_url:url.href,url:url.href,fetched_at:now};
 try{const response=await fetcher(url.href,{redirect:'manual',headers:{Accept:'application/json','User-Agent':'FindPitches-V3-Venue-Verification/1.0'},signal:AbortSignal.timeout(20000)});document.http_status=response.status;
  if(response.status!==200)return {position:null,reason:'census_http_'+response.status,document};
  const reader=response.body.getReader(),parts=[];let n=0;try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>262144){await reader.cancel();return {position:null,reason:'census_response_size_limit',document};}parts.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(n);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}document.json_text=new TextDecoder().decode(bytes);return {...censusPosition(address,document),document};
 }catch{return {position:null,reason:'census_fetch_failed',document};}
}
