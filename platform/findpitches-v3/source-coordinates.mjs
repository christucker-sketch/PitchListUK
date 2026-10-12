import {publicHttps} from './contract.mjs';

// Coordinates decorate current source proof; they never supply identity,
// country, an application route or a READY decision.
export const VENUE_COORDINATE_POLICY='source-venue-coordinate-v1';
const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
const aliases={uk:'GB',gb:'GB','united kingdom':'GB',england:'GB',scotland:'GB',wales:'GB','northern ireland':'GB',us:'US',usa:'US','united states':'US','united states of america':'US',ca:'CA',canada:'CA',au:'AU',australia:'AU',nz:'NZ','new zealand':'NZ',ie:'IE',ireland:'IE'};
const country=v=>aliases[clean(typeof v==='object'?v?.name:v).toLowerCase()]??null;
function number(v){return typeof v==='number'?v:typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v.trim())?Number(v):NaN;}
const boxes={GB:[[49,61,-9,2]],US:[[24,50,-125,-66],[51,72,-180,-129],[51,72,172,180],[18,23,-161,-154]],CA:[[41,84,-142,-52]],AU:[[-44,-9,112,154]],NZ:[[-48,-33,165,180],[-45,-43,-177,-175]],IE:[[51,56,-11,-5]]};
export function coordinateCountryConsistent(code,lat,lng){return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<90&&Math.abs(lng)<=180&&Boolean(boxes[code]?.some(([s,n,w,e])=>lat>=s&&lat<=n&&lng>=w&&lng<=e));}
export function validVenueCoordinates(value,{country:code,location}={}) {
  if(!value||value.policy!==VENUE_COORDINATE_POLICY||value.precision!=='venue'||value.country!==code||clean(value.location)!==clean(location)||!clean(location)||!publicHttps(value.source_url)||!['event_location_geo','official_venue_directions'].includes(value.method))return null;
  const lat=number(value.lat),lng=number(value.lng);if(!coordinateCountryConsistent(code,lat,lng))return null;
  return {...value,lat,lng};
}
export function eventVenueCoordinates(events,facts,sourceUrl) {
  const candidates=[];
  for(const event of events) {
    const place=event?.location,geo=place?.geo;if(!geo)continue;
    const address=place.address??{},label=clean([place.name,address.streetAddress,address.addressLocality,address.addressRegion,address.postalCode].filter(Boolean).join(', '));
    // Only this event's own venue geo. Organisation/footer maps, locality and
    // postcode centres cannot become a precise venue position.
    if(!address.streetAddress||!address.addressLocality||/^(?:tba|tbd|to be)/i.test(clean(address.streetAddress))||country(address.addressCountry)!==facts.country||label!==clean(facts.location))return null;
    if(geo['@type']&&geo['@type']!=='GeoCoordinates')return null;
    const value=validVenueCoordinates({policy:VENUE_COORDINATE_POLICY,precision:'venue',country:facts.country,location:facts.location,lat:geo.latitude,lng:geo.longitude,source_url:sourceUrl,method:'event_location_geo'},facts);
    if(!value)return null;candidates.push(value);
  }
  const unique=[...new Map(candidates.map(p=>[p.lat+','+p.lng,p])).values()];return unique.length===1?unique[0]:null;
}
export function retainedVenueCoordinates(report) {
  const facts=report.facts??{};
  // New parsers explicitly record null for missing/contradictory geo. Do not
  // fall back to a truncated/first JSON-LD block after that decision.
  if(report.venue_coordinate_policy)return report.venue_coordinate_policy===VENUE_COORDINATE_POLICY?validVenueCoordinates(report.venue_coordinates,facts):null;
  const evidence=report.coordinate_evidence??report.evidence??[];
  if(report.profile==='myntimage'&&facts.country==='GB') {
    const pins=evidence.filter(e=>e.kind==='venue_coordinate_country_proof');if(pins.length!==1)return null;
    try {
      const data=JSON.parse(pins[0].excerpt),url=new URL(pins[0].source_url),source=new URL(report.source_url),pin=data.official_venue_pin;
      if(source.hostname!=='www.myntimage.co.uk'||!/^\/events\/[a-z-]+\/$/.test(source.pathname)||url.origin!=='https://api.postcodes.io'||url.pathname!=='/postcodes'||country(data.country)!=='GB'||!data.postcode||!Number.isFinite(data.distance_metres)||data.distance_metres<0||data.distance_metres>100||url.searchParams.get('radius')!=='100'||url.searchParams.get('limit')!=='1'||number(url.searchParams.get('lat'))!==pin?.lat||number(url.searchParams.get('lon'))!==pin?.lon)return null;
      // The original verifier already bound the official directions heading
      // and map pin to this exact venue and corroborated it within 100m.
      return validVenueCoordinates({policy:VENUE_COORDINATE_POLICY,precision:'venue',country:'GB',location:facts.location,lat:pin.lat,lng:pin.lon,source_url:'https://www.myntimage.co.uk/directions/'+source.pathname.split('/')[2]+'/',method:'official_venue_directions'},facts);
    }catch{return null;}
  }
  // Older generic receipts retained only the first, sometimes truncated,
  // JSON-LD block. Reparse their complete immutable document before adding
  // coordinates; it may contain contradictory duplicate venue positions.
  return null;
}
