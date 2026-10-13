// Fetch owned source evidence before classifying it. Additional geography is
// tied to the exact Event postal address, never an acquisition query or footer.
import {fetchSourceDocument} from './source-document.mjs';import {fetchMyntBundle,myntVenueUrl} from './uk-sources.mjs';import {fetchCCABundle,ccaVenueUrl} from './creative-crafts.mjs';import {dundeeFoodURL,fetchDundeeBundle} from './dundeeheritage.mjs';import {verifyDocument} from './verification.mjs';import {fetchUKPostcode,sourceEventPostcode} from './uk-event-geography.mjs';import {hash} from './contract.mjs';
import {hummingbirdURL,fetchHummingbirdBundle} from './hummingbird.mjs';
import {veganEventURL,fetchVeganBundle} from './vegan-events.mjs';
export async function fetchProofDocument(url,{fetcher=fetch,now=new Date().toISOString(),sourceIdentifier=null}={}) {
  if(myntVenueUrl(url)&&sourceIdentifier)return fetchMyntBundle(url,sourceIdentifier,{fetcher,now});
  if(ccaVenueUrl(url)&&sourceIdentifier)return fetchCCABundle(url,sourceIdentifier,{fetcher,now});
  if(dundeeFoodURL(url))return fetchDundeeBundle(url,{fetcher,now});
  if(hummingbirdURL(url)&&sourceIdentifier)return fetchHummingbirdBundle(url,sourceIdentifier,{fetcher,now});
  if(veganEventURL(url))return fetchVeganBundle(url,sourceIdentifier,{fetcher,now});
  const source=await fetchSourceDocument(url,{fetcher,now}),report=verifyDocument(source,{now}),postcode=sourceEventPostcode(report);
  if(!postcode||report.facts.country&&report.facts.country!=='GB')return source;
  const geo=await fetchUKPostcode(postcode,{fetcher,now}),documents=[source,geo];return {document_kind:'uk_event_geography_bundle',requested_url:source.requested_url,url:source.url,fetched_at:new Date(Math.min(...documents.map(d=>Date.parse(d.fetched_at)))).toISOString(),content_hash:await hash(documents.map(d=>d.content_hash??d.reason)),documents};
}
