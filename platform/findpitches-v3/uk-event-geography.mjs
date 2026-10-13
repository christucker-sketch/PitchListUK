// Source-event postal addresses can be corroborated by a public postcode
// receipt. Query geography, company footers and postcode-centre pins are excluded.
import {hash,stableJson} from './contract.mjs';
import {applyUsableRoute} from './usable-route.mjs';
const normalize=v=>String(v??'').toUpperCase().replace(/\s/g,'');
export const ukPostcode=v=>/^(?:GIR0AA|[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2})$/.test(normalize(v))?normalize(v):null;
export const postcodeURL=v=>'https://api.postcodes.io/postcodes/'+encodeURIComponent(ukPostcode(v)??'');
export async function fetchUKPostcode(value,{fetcher=fetch,now=new Date().toISOString()}={}) {
  const code=ukPostcode(value);if(!code)throw Error('source_event_postcode_required');const url=postcodeURL(code),meta={requested_url:url,url,fetched_at:now,document_kind:'uk_postcode_receipt'};
  try {
    const r=await fetcher(url,{headers:{Accept:'application/json','User-Agent':'FindPitches-V3-Shadow-Verification/1.0'},redirect:'manual',signal:AbortSignal.timeout(12000)});
    if(!r.ok)return {...meta,http_status:r.status,reason:'postcode_http_'+r.status};
    if(!/application\/json/i.test(r.headers.get('content-type')??''))return {...meta,reason:'postcode_json_required'};
    const reader=r.body.getReader(),parts=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();return {...meta,reason:'postcode_response_size_limit'};}parts.push(value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
    const json_text=new TextDecoder().decode(bytes);return {...meta,http_status:r.status,json_text,content_hash:await hash(json_text)};
  }catch{return {...meta,reason:'postcode_fetch_failed'};}
}
export function postcodeProof(document,expected,{now=new Date().toISOString()}={}) {
  try {
    const code=ukPostcode(expected),r=JSON.parse(document.json_text);if(!code||document.reason||document.http_status!==200||document.url!==postcodeURL(code)||document.requested_url!==document.url||!Number.isFinite(Date.parse(document.fetched_at))||Date.parse(document.fetched_at)>Date.parse(now)||r.status!==200||ukPostcode(r.result.postcode)!==code||!['England','Scotland','Wales','Northern Ireland'].includes(r.result.country))return null;
    return {postcode:code,country:'GB',nation:r.result.country,region:['Scotland','Wales','Northern Ireland'].includes(r.result.country)?r.result.country:r.result.region??null};
  }catch{return null;}
}
export function sourceEventPostcode(report) {
  if(report.page_kind!=='event'||report.status==='quarantine')return null;
  try {const event=JSON.parse(report.evidence?.find(e=>e.kind==='event_json_ld')?.excerpt??'null'),address=event?.location?.address;
    // The ordinary verifier has already bound this Event to its own heading,
    // date and URL. An Organization's address or bare body postcode cannot join.
    return address?.streetAddress&&address.addressLocality&&ukPostcode(address.postalCode)||null;
  }catch{return null;}
}
export function verifyUKEventGeography(document,{now,verify}) {
  if(!Array.isArray(document.documents)||document.documents.length!==2)return {status:'unverified',facts:{},reasons:['uk_event_geography_bundle_invalid']};
  const [source,geo]=document.documents,report=verify(source,{now});
  const clocks=document.documents.map(d=>Date.parse(d.fetched_at));
  if(clocks.some(t=>!Number.isFinite(t)||t>Date.parse(now))||document.requested_url!==source.requested_url||document.url!==source.url||document.fetched_at!==new Date(Math.min(...clocks)).toISOString())return {...report,status:'quarantine',reasons:[...report.reasons,'uk_event_geography_custody_mismatch']};
  const postcode=sourceEventPostcode(report),proof=postcodeProof(geo,postcode,{now});
  if(!proof)return {...report,reasons:[...report.reasons,'source_event_postcode_country_not_proved']};
  if(report.facts.country&&report.facts.country!==proof.country)return {...report,status:'quarantine',reasons:[...report.reasons,'contradictory_event_postcode_country']};
  report.facts={...report.facts,country:proof.country,...proof.region?{region_code:proof.region}:{}};report.nation=proof.nation;report.checked_at=document.fetched_at;
  report.reasons=report.reasons.filter(r=>r!=='verified_country_missing');report.evidence.push({kind:'source_event_postcode_country',source_url:geo.url,excerpt:stableJson(proof)});
  if(!report.reasons.length&&['partial','unverified','verified'].includes(report.status))report.status='verified';
  return applyUsableRoute(source,report,{now});
}
