import {record,NOW} from './helpers.mjs';
export function documentFixture({profile='eventeny',event={},body='',url=null,duplicates=[]}={}) {
  const input=record(),source=url??input.application_url;
  const data={'@type':'Event',name:input.event_name,url:source,startDate:input.event_start,endDate:input.event_end,
    location:{name:'River Hall',address:{streetAddress:'1 River Street',addressLocality:'Austin',addressRegion:'Texas',addressCountry:'US'}},organizer:{name:input.organiser},
    offers:[{'@type':'Offer',url:source,availability:'https://schema.org/InStock',availabilityStarts:'2026-09-01T12:00:00Z',availabilityEnds:'2026-11-20T23:59:00Z'}],...event};
  const heading=profile==='eventeny'?'Vendor Application | 2026':data.name;
  const content=profile==='localstalls'?'<div class="ls-ev-openline">Stallholder applications open</div><a href="https://localstalls.com/au/application/11111111-1111-1111-1111-111111111111?event=22222222-2222-2222-2222-222222222222">Submit Application</a>':'<button>Start Application</button>';
  return {requested_url:source,url:source,http_status:200,fetched_at:NOW,html:'<html><head>'+[data,...duplicates].map(e=>'<script type="application/ld+json">'+JSON.stringify(e)+'</script>').join('')+'</head><body><nav><a href="/register">Apply</a></nav><main><h1>'+heading+'</h1>'+content+body+'</main><footer><a href="/vendor-registration">Submit Application</a></footer></body></html>'};
}
