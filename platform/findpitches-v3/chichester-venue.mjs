// A reviewed physical room -> building -> address join. Council room hire is
// geography evidence only; it never replaces Mynt's trader application.
import {parseHtml,first,nodes,text,hasClass} from './source-dom.mjs';
import {postcodeProof} from './uk-event-geography.mjs';
export const CHICHESTER_ROOM='https://chichestercity.gov.uk/assembly-room/';
export const CHICHESTER_HOUSE='https://chichestercity.gov.uk/the-council-house/';
export const CHICHESTER_SOURCE='https://www.myntimage.co.uk/events/chichester/';
const own=(docs,url)=>docs.filter(d=>d.url===url&&d.requested_url===url&&!d.reason&&d.http_status===200&&d.html);
export function chichesterPostalBinding(event,documents) {
  if(event.url!==CHICHESTER_SOURCE||event.requested_url!==event.url)return null;
  const mynt=first(parseHtml(event.html??''),n=>n.attrs?.id==='content_area');
  if(text(first(mynt,n=>n.tag==='h1'))!=='Chichester Assembly Rooms')return null;
  const paragraphs=nodes(mynt,n=>n.tag==='p').map(text).join(' ');
  if(!/North Street/i.test(paragraphs)||!/(?:first|1st)[- ]floor/i.test(text(mynt)))return null;
  const rooms=own(documents,CHICHESTER_ROOM),houses=own(documents,CHICHESTER_HOUSE);
  if(rooms.length!==1||houses.length!==1)return null;
  const room=first(parseHtml(rooms[0].html),n=>hasClass(n,'page__content'));
  const houseRoot=parseHtml(houses[0].html),house=first(houseRoot,n=>hasClass(n,'page__content'));
  const roomText=text(room),houseText=text(house);
  if(!/The Assembly Room .* is on the first floor of the building/i.test(roomText)||!/fairs, exhibitions/i.test(roomText)||!/a lift is available/i.test(roomText))return null;
  if(!/The Council House in North Street, Chichester/i.test(houseText)||!/Areas of the Council House: Assembly Room and Ante Room/i.test(houseText))return null;
  const containment=nodes(house,n=>n.tag==='a'&&n.attrs.href).some(n=>{try{return [CHICHESTER_ROOM,'https://chichestercity.gov.uk/assembly-room-and-ante-room/'].includes(new URL(n.attrs.href,CHICHESTER_HOUSE).href)&&/^Assembly Room and Ante Room$/.test(text(n));}catch{return false;}});
  if(!containment)return null;
  // This named building is already proved to contain the event room. A bare
  // company postcode, alternate office or unbound council footer cannot join.
  const contact=first(houseRoot,n=>n.attrs?.id==='text-2'),address=nodes(contact,n=>n.tag==='p').map(text).filter(s=>/The Council House North Street Chichester, PO19 1LQ/.test(s));
  if(address.length!==1)return null;
  return {postcode:'PO191LQ',room_source:CHICHESTER_ROOM,building_source:CHICHESTER_HOUSE,room_excerpt:roomText.slice(0,700),building_excerpt:houseText,address_excerpt:address[0],producer_venue_label:'Chichester Assembly Rooms',council_venue_label:'Assembly Room'};
}
export function chichesterCountryProof(event,documents,{now}) {
  const binding=chichesterPostalBinding(event,documents);if(!binding)return null;
  const receipts=documents.filter(d=>d.url==='https://api.postcodes.io/postcodes/PO191LQ');
  if(receipts.length!==1)return null;
  const country=postcodeProof(receipts[0],binding.postcode,{now});
  if(!country||country.nation!=='England')return null;
  return {...binding,...country,receipt_source:receipts[0].url};
}
