// Fetch owned source evidence before classifying it. Additional geography is
// tied to the exact Event postal address, never an acquisition query or footer.
import {fetchSourceDocument} from './source-document.mjs';import {fetchMyntBundle,myntVenueUrl} from './uk-sources.mjs';import {fetchCCABundle,ccaVenueUrl} from './creative-crafts.mjs';import {dundeeFoodURL,fetchDundeeBundle} from './dundeeheritage.mjs';import {verifyDocument} from './verification.mjs';import {fetchUKPostcode,sourceEventPostcode} from './uk-event-geography.mjs';import {hash} from './contract.mjs';
import {hummingbirdURL,fetchHummingbirdBundle} from './hummingbird.mjs';
import {veganEventURL,fetchVeganBundle} from './vegan-events.mjs';
import {discoverUsableRoutes,eventenyContactRoute,eventenySignupRoute} from './usable-route.mjs';
export async function fetchProofDocument(url,{fetcher=fetch,now=new Date().toISOString(),sourceIdentifier=null}={}) {
  if(myntVenueUrl(url)&&sourceIdentifier)return fetchMyntBundle(url,sourceIdentifier,{fetcher,now});
  if(ccaVenueUrl(url)&&sourceIdentifier)return fetchCCABundle(url,sourceIdentifier,{fetcher,now});
  if(dundeeFoodURL(url))return fetchDundeeBundle(url,{fetcher,now});
  if(hummingbirdURL(url)&&sourceIdentifier)return fetchHummingbirdBundle(url,sourceIdentifier,{fetcher,now});
  if(veganEventURL(url))return fetchVeganBundle(url,sourceIdentifier,{fetcher,now});
  const source=await fetchSourceDocument(url,{fetcher,now}),report=verifyDocument(source,{now}),postcode=sourceEventPostcode(report);
  const contact=eventenyContactRoute(source,report,{now});
  if(contact&&!report.usable_route){
    const login=await fetchSourceDocument(contact,{fetcher,now}),documents=[source,login],signup=eventenySignupRoute(login,contact);
    if(signup)documents.push(await fetchSourceDocument(signup,{fetcher,now}));
    return {document_kind:'global_usable_route_bundle',requested_url:source.requested_url,url:source.url,fetched_at:new Date(Math.min(...documents.map(d=>Date.parse(d.fetched_at)))).toISOString(),content_hash:await hash(documents),documents};
  }
  const links=discoverUsableRoutes(source,report);
  if(!report.usable_route&&links.length){
    const documents=[source];for(const link of links)documents.push(await fetchSourceDocument(link.url,{fetcher,now}));
    return {document_kind:'global_usable_route_bundle',requested_url:source.requested_url,url:source.url,fetched_at:new Date(Math.min(...documents.map(d=>Date.parse(d.fetched_at)))).toISOString(),content_hash:await hash(documents),documents};
  }
  if(!postcode||report.facts.country&&report.facts.country!=='GB')return source;
  const geo=await fetchUKPostcode(postcode,{fetcher,now}),documents=[source,geo],bundle={document_kind:'uk_event_geography_bundle',requested_url:source.requested_url,url:source.url,fetched_at:new Date(Math.min(...documents.map(d=>Date.parse(d.fetched_at)))).toISOString(),content_hash:await hash(documents.map(d=>d.content_hash??d.reason)),documents};
  const proven=verifyDocument(bundle,{now}),routes=discoverUsableRoutes(source,proven);
  if(!proven.usable_route&&routes.length){const joined=[bundle];for(const link of routes)joined.push(await fetchSourceDocument(link.url,{fetcher,now}));return {document_kind:'global_usable_route_bundle',requested_url:source.requested_url,url:source.url,fetched_at:new Date(Math.min(...joined.map(d=>Date.parse(d.fetched_at)))).toISOString(),content_hash:await hash(joined),documents:joined};}
  return bundle;
}
