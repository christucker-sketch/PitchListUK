import {CCA_ORIGIN,CCA_BOOKING} from '../../platform/findpitches-v3/creative-crafts.mjs';
import {NOW} from './helpers.mjs';
const URL=CCA_ORIGIN+'/craft-events/26/Lowther-Gardens,-Lytham-St-Annes',NEXT=CCA_BOOKING+'Next-Step.asp',DIRECTIONS=CCA_ORIGIN+'/craft-event-directions/',GEO='https://api.postcodes.io/postcodes/FY85QQ';
const brand='<meta name="description" content="Creative Crafts Association Craft & Gift Booking Form">';
export const option=(id,title,start,end)=>`<input type="checkbox" id="${id}" name="${id}"><label for="${id}"><b>${title}</b> (${start} - ${end})</label>`;
const row=(title,month,days,date)=>`<tr><td colspan="2">${month} 2026</td></tr><tr><td>${days}</td><td>${title}<a href="${CCA_BOOKING}?event_date=${date}#${month}"><img alt="Book Event"></a><a href="${DIRECTIONS}#Location26"><img alt="Location"></a></td></tr>`;
export function documents() {
  const data={
    [CCA_BOOKING]:brand+'<form name="Booking_Form" action="Next-Step.asp" method="post">Please choose the event(s) that you wish to make a booking for:'+option('checkboxG1678','Lowther Gardens, Pumpkin Festival Lytham st Annes','24 October 2026','25 October 2026')+option('checkboxG1685','Christmas at Lowther Gardens, Lytham st Annes','12 December 2026','13 December 2026')+option('checkboxG1706','Gazebo space at Lowther Gardens Lytham','24 October 2026','24 October 2026')+option('checkboxG1687','Christmas at Arley Hall','07 December 2026','07 December 2025')+'<input type="submit" value="PROCEED &gt;&gt;"></form>',
    [NEXT]:brand+'<form name="Booking_Form" action="Next-Step2_new.asp" method="post"><table><tr><td>Trading Name *</td><td><input name="Trading_name"></td></tr><tr><td>Crafts</td><td><textarea name="Crafts"></textarea></td></tr><tr><td>Country</td><td><input name="Country" value="United Kingdom"></td></tr></table><input type="submit" value="PROCEED &gt;&gt;"></form>',
    [DIRECTIONS]:`<a name="Location26"></a><br><a href="${URL}">Lowther Gardens, Lytham St Annes</a><br>West Beach, Lytham<br>FY8 5QQ<br><iframe src="https://maps.example.test/"></iframe><footer>United Kingdom</footer>`,
    [URL]:'<h1>Craft Shows and Events at Lowther Gardens, Lytham St Annes for 2026</h1><table id="events">'+row('Lowther Gardens, Pumpkin Festival Lytham st Annes','October','Sat 24<sup>rd</sup> - Sun 25<sup>th</sup>','24 October 2026')+row('Christmas at Lowther Gardens, Lytham st Annes','December','Sat 12<sup>th</sup> - Sun 13<sup>th</sup>','12 December 2026')+'</table>',
    [GEO]:JSON.stringify({status:200,result:{postcode:'FY8 5QQ',country:'England',region:'North West',latitude:53.73,longitude:-2.97}}),
  };
  return Object.entries(data).map(([url,data])=>({url,requested_url:url,fetched_at:NOW,...(url===GEO?{json_text:data}:{html:data})}));
}
export const fetcherFor=docs=>async url=>{const d=docs.find(d=>d.url===url);return new Response(d?.html??d?.json_text??'',{status:d?200:404,headers:{'content-type':d?.json_text?'application/json':'text/html'}});};
